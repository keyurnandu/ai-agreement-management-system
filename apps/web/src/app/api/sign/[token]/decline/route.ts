import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Public, token-gated. A recipient declines to sign -> the whole agreement is declined.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await prisma.recipient.findUnique({ where: { accessToken: token }, include: { agreement: true } });
  if (!r) return NextResponse.json({ error: "invalid or expired link" }, { status: 404 });
  if (r.status === "SIGNED") return NextResponse.json({ error: "already signed" }, { status: 409 });
  if (r.agreement.status !== "SENT" && r.agreement.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "this agreement is not open" }, { status: 409 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };

  await prisma.recipient.update({ where: { id: r.id }, data: { status: "DECLINED" } });
  await prisma.agreement.update({ where: { id: r.agreementId }, data: { status: "DECLINED" } });

  await recordAudit({
    action: "recipient.decline",
    actorEmail: r.email,
    resourceType: "AGREEMENT",
    resourceId: r.agreementId,
    ip: req.headers.get("x-forwarded-for"),
    metadata: { recipientId: r.id, reason: body.reason ?? null },
  });
  await recordAudit({
    action: "agreement.declined",
    resourceType: "AGREEMENT",
    resourceId: r.agreementId,
    metadata: { by: r.email },
  });

  return NextResponse.json({ ok: true });
}
