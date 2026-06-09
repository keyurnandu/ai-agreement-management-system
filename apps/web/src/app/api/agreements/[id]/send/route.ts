import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getManageableAgreement, newToken } from "@/lib/agreements";
import { env } from "@/env";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const ag = await getManageableAgreement(actor, id);
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ag.status !== "DRAFT") return NextResponse.json({ error: "agreement already sent" }, { status: 409 });

  const recipients = await prisma.recipient.findMany({ where: { agreementId: id } });
  const fields = await prisma.field.findMany({ where: { agreementId: id } });

  const signers = recipients.filter((r) => r.role === "SIGNER" || r.role === "APPROVER");
  if (signers.length === 0) {
    return NextResponse.json({ error: "add at least one signer or approver" }, { status: 400 });
  }
  const recipientsWithFields = new Set(fields.map((f) => f.recipientId).filter(Boolean) as string[]);
  const missing = signers.filter((s) => !recipientsWithFields.has(s.id));
  if (missing.length) {
    return NextResponse.json(
      { error: `these signers have no fields placed: ${missing.map((m) => m.email).join(", ")}` },
      { status: 400 },
    );
  }

  const parallel = ag.routingType === "PARALLEL";
  const firstSignerId = [...signers].sort((a, b) => a.routingOrder - b.routingOrder)[0]?.id;

  for (const r of recipients) {
    let status: string;
    if (r.role === "CC") status = "SENT";
    else if (parallel) status = "SENT";
    else status = r.id === firstSignerId ? "SENT" : "PENDING";
    await prisma.recipient.update({ where: { id: r.id }, data: { accessToken: newToken(), status } });
  }

  await prisma.agreement.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  await recordAudit({
    action: "agreement.send",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: { recipients: recipients.length, routingType: ag.routingType },
  });

  const updated = await prisma.recipient.findMany({ where: { agreementId: id }, orderBy: { routingOrder: "asc" } });
  return NextResponse.json({
    status: "SENT",
    recipients: updated.map((r) => ({
      id: r.id,
      email: r.email,
      status: r.status,
      signUrl: r.accessToken ? `${env.APP_BASE_URL}/sign/${r.accessToken}` : null,
    })),
  });
}
