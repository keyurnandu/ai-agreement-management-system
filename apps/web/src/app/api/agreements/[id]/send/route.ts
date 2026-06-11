import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getManageableAgreement, newToken } from "@/lib/agreements";
import { autoPlaceSignatureFields } from "@/lib/auto-signature-fields";
import { signerHasStandardBlock } from "@/lib/signature-layout";
import { env } from "@/env";
import { sendSigningInvite } from "@/lib/adapters/email";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const ag = await getManageableAgreement(actor, id);
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ag.status !== "DRAFT") return NextResponse.json({ error: "agreement already sent" }, { status: 409 });

  let recipients = await prisma.recipient.findMany({ where: { agreementId: id } });
  let fields = await prisma.field.findMany({ where: { agreementId: id } });

  const signers = recipients.filter((r) => r.role === "SIGNER" || r.role === "APPROVER");
  if (signers.length === 0) {
    return NextResponse.json({ error: "add at least one signer or approver" }, { status: 400 });
  }

  const needsAuto = signers.some((s) => !signerHasStandardBlock(fields, s.id));
  if (needsAuto) {
    try {
      await autoPlaceSignatureFields(id, actor.id);
      fields = await prisma.field.findMany({ where: { agreementId: id } });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "auto-place failed" }, { status: 400 });
    }
  }

  const missing = signers.filter((s) => !signerHasStandardBlock(fields, s.id));
  if (missing.length) {
    return NextResponse.json(
      { error: `incomplete signature blocks for: ${missing.map((m) => m.email).join(", ")}` },
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

  const updated = await prisma.recipient.findMany({ where: { agreementId: id }, orderBy: { routingOrder: "asc" } });
  const base = env.APP_BASE_URL.replace(/\/$/, "");

  for (const r of updated) {
    if (r.role === "CC" || !r.accessToken) continue;
    const signUrl = `${base}/sign/${r.accessToken}`;
    try {
      await sendSigningInvite({
        to: r.email,
        agreementTitle: ag.title,
        signUrl,
      });
    } catch {
      /* email optional */
    }
  }

  await recordAudit({
    action: "agreement.send",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: { recipients: recipients.length, routingType: ag.routingType },
  });

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
