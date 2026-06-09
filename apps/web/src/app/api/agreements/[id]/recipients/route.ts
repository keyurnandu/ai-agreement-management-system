import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getManageableAgreement, RECIPIENT_ROLES } from "@/lib/agreements";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const ag = await getManageableAgreement(actor, id);
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ag.status !== "DRAFT") return NextResponse.json({ error: "agreement already sent" }, { status: 409 });

  const body = (await req.json()) as { email?: string; name?: string; role?: string; routingOrder?: number };
  if (!body.email) return NextResponse.json({ error: "email required" }, { status: 400 });
  const role = (body.role ?? "SIGNER").toUpperCase();
  if (!RECIPIENT_ROLES.includes(role)) return NextResponse.json({ error: `invalid role: ${role}` }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: body.email } });
  const r = await prisma.recipient.create({
    data: {
      agreementId: id,
      email: body.email,
      name: body.name ?? user?.name ?? null,
      role,
      routingOrder: Number(body.routingOrder ?? 1),
      userId: user?.id ?? null,
      status: "PENDING",
    },
  });

  await recordAudit({
    action: "recipient.add",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: { recipientId: r.id, email: body.email, role },
  });

  return NextResponse.json({ id: r.id });
}
