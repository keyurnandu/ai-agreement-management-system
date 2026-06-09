import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument } from "@/lib/documents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; annId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, annId } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };

  const ann = await prisma.annotation.findUnique({ where: { id: annId } });
  if (!ann || ann.documentId !== id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const mayMutate = ann.authorId === actor.id || (await canAccessDocument(actor, id, "MANAGE"));
  if (!mayMutate) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { text?: string; resolved?: boolean };
  const updated = await prisma.annotation.update({
    where: { id: annId },
    data: {
      text: body.text ?? ann.text,
      resolved: typeof body.resolved === "boolean" ? body.resolved : ann.resolved,
    },
  });

  await recordAudit({
    action: "annotation.update",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { annotationId: annId, resolved: updated.resolved },
  });

  return NextResponse.json({ ok: true, resolved: updated.resolved });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id, annId } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };

  const ann = await prisma.annotation.findUnique({ where: { id: annId } });
  if (!ann || ann.documentId !== id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const mayMutate = ann.authorId === actor.id || (await canAccessDocument(actor, id, "MANAGE"));
  if (!mayMutate) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  await prisma.annotation.delete({ where: { id: annId } });

  await recordAudit({
    action: "annotation.delete",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { annotationId: annId },
  });

  return NextResponse.json({ ok: true });
}
