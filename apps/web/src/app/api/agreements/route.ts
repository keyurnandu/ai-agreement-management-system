import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument } from "@/lib/documents";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: uid, role } = session.user;

  const where = roleAtLeast(role, "MANAGER")
    ? {}
    : { OR: [{ ownerId: uid }, { recipients: { some: { userId: uid } } }] };

  const ags = await prisma.agreement.findMany({
    where,
    include: { document: { select: { title: true } }, recipients: true },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    agreements: ags.map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      routingType: a.routingType,
      recipients: a.recipients.length,
      signed: a.recipients.filter((r) => r.status === "SIGNED").length,
      updatedAt: a.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const body = (await req.json()) as {
    documentId?: string;
    title?: string;
    routingType?: string;
    message?: string;
  };
  if (!body.documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });
  if (!(await canAccessDocument(actor, body.documentId, "MANAGE"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const existing = await prisma.agreement.findUnique({ where: { documentId: body.documentId } });
  if (existing) return NextResponse.json({ id: existing.id, existing: true });

  const doc = await prisma.document.findUnique({ where: { id: body.documentId }, select: { title: true } });
  const ag = await prisma.agreement.create({
    data: {
      documentId: body.documentId,
      title: body.title?.trim() || doc?.title || "Agreement",
      ownerId: actor.id,
      routingType: body.routingType === "PARALLEL" ? "PARALLEL" : "SEQUENTIAL",
      message: body.message ?? null,
      status: "DRAFT",
    },
  });

  await recordAudit({
    action: "agreement.create",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: ag.id,
    metadata: { documentId: body.documentId },
  });

  return NextResponse.json({ id: ag.id });
}
