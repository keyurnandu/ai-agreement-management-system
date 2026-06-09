import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getManageableAgreement } from "@/lib/agreements";

export const dynamic = "force-dynamic";

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

type Ctx = { params: Promise<{ id: string; fieldId: string }> };

async function loadDraftField(actorRole: string, actorId: string, id: string, fieldId: string) {
  const ag = await getManageableAgreement({ id: actorId, role: actorRole }, id);
  if (!ag) return { error: NextResponse.json({ error: "not found" }, { status: 404 }) };
  if (ag.status !== "DRAFT") return { error: NextResponse.json({ error: "agreement already sent" }, { status: 409 }) };
  const field = await prisma.field.findUnique({ where: { id: fieldId } });
  if (!field || field.agreementId !== id) return { error: NextResponse.json({ error: "field not found" }, { status: 404 }) };
  return { field };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, fieldId } = await ctx.params;
  const res = await loadDraftField(session.user.role, session.user.id, id, fieldId);
  if ("error" in res) return res.error;

  const b = (await req.json()) as { x?: number; y?: number; width?: number; height?: number };
  const data: Prisma.FieldUpdateInput = {};
  if (typeof b.x === "number") data.x = clamp(b.x, 0, 0.99);
  if (typeof b.y === "number") data.y = clamp(b.y, 0, 0.99);
  if (typeof b.width === "number") data.width = clamp(b.width, 0.02, 1);
  if (typeof b.height === "number") data.height = clamp(b.height, 0.01, 1);

  await prisma.field.update({ where: { id: fieldId }, data });
  await recordAudit({
    action: "field.move",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: { fieldId },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, fieldId } = await ctx.params;
  const res = await loadDraftField(session.user.role, session.user.id, id, fieldId);
  if ("error" in res) return res.error;

  await prisma.field.delete({ where: { id: fieldId } });
  await recordAudit({
    action: "field.delete",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: { fieldId },
  });
  return NextResponse.json({ ok: true });
}
