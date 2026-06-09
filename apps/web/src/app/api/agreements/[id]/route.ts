import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getManageableAgreement } from "@/lib/agreements";
import { latestVersion } from "@/lib/documents";
import { recordAudit } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await getManageableAgreement(actor, id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ag = await prisma.agreement.findUnique({
    where: { id },
    include: {
      document: { select: { title: true } },
      recipients: { orderBy: { routingOrder: "asc" } },
      fields: true,
    },
  });
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });

  const version = await latestVersion(ag.documentId);

  return NextResponse.json({
    id: ag.id,
    title: ag.title,
    status: ag.status,
    routingType: ag.routingType,
    documentId: ag.documentId,
    documentTitle: ag.document.title,
    pageCount: version?.pageCount ?? 1,
    message: ag.message,
    sentAt: ag.sentAt,
    completedAt: ag.completedAt,
    recipients: ag.recipients.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      routingOrder: r.routingOrder,
      status: r.status,
      signedAt: r.signedAt,
      token: r.accessToken, // owner view → expose so links can be shared
    })),
    fields: ag.fields.map((f) => ({
      id: f.id,
      recipientId: f.recipientId,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
    })),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const ag = await getManageableAgreement(actor, id);
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ag.status !== "DRAFT") return NextResponse.json({ error: "can only edit a draft" }, { status: 409 });

  const body = (await req.json()) as {
    routingType?: string;
    title?: string;
    message?: string;
    expiresInDays?: number;
  };

  const data: Prisma.AgreementUpdateInput = {};
  if (body.routingType && ["SEQUENTIAL", "PARALLEL"].includes(body.routingType)) data.routingType = body.routingType;
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.message === "string") data.message = body.message;
  if (typeof body.expiresInDays === "number") {
    data.expiresAt = body.expiresInDays > 0 ? new Date(Date.now() + body.expiresInDays * 86400000) : null;
  }

  await prisma.agreement.update({ where: { id }, data });
  await recordAudit({
    action: "agreement.update",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: data as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true });
}
