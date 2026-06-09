import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { FIELD_TYPES, getManageableAgreement } from "@/lib/agreements";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const ag = await getManageableAgreement(actor, id);
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ag.status !== "DRAFT") return NextResponse.json({ error: "agreement already sent" }, { status: 409 });

  const body = (await req.json()) as {
    recipientId?: string;
    type?: string;
    page?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    required?: boolean;
  };

  const type = (body.type ?? "SIGNATURE").toUpperCase();
  if (!FIELD_TYPES.includes(type)) return NextResponse.json({ error: `invalid type: ${type}` }, { status: 400 });

  if (body.recipientId) {
    const r = await prisma.recipient.findUnique({ where: { id: body.recipientId } });
    if (!r || r.agreementId !== id) {
      return NextResponse.json({ error: "recipient not in this agreement" }, { status: 400 });
    }
  }

  const f = await prisma.field.create({
    data: {
      agreementId: id,
      recipientId: body.recipientId ?? null,
      type,
      page: Math.max(1, Number(body.page ?? 1)),
      x: Number(body.x ?? 0),
      y: Number(body.y ?? 0),
      width: Number(body.width ?? 0.25),
      height: Number(body.height ?? 0.04),
      required: body.required ?? true,
    },
  });

  await recordAudit({
    action: "field.add",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: { fieldId: f.id, type, page: f.page, recipientId: body.recipientId },
  });

  return NextResponse.json({ id: f.id });
}
