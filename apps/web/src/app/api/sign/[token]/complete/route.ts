import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { advanceRouting, enforceExpiry, maybeFinalizeAgreement } from "@/lib/agreements";

export const dynamic = "force-dynamic";

// Public, token-gated. Records this recipient's field values and signature.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await prisma.recipient.findUnique({ where: { accessToken: token }, include: { agreement: true } });
  if (!r) return NextResponse.json({ error: "invalid or expired link" }, { status: 404 });

  if (await enforceExpiry(r.agreement)) {
    return NextResponse.json({ error: "this agreement has expired" }, { status: 409 });
  }
  if (r.status === "SIGNED") return NextResponse.json({ error: "already signed" }, { status: 409 });
  if (r.status !== "SENT" && r.status !== "VIEWED") {
    return NextResponse.json({ error: "it is not your turn yet" }, { status: 403 });
  }
  if (r.agreement.status !== "SENT" && r.agreement.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "this agreement is not open for signing" }, { status: 409 });
  }

  const body = (await req.json()) as { values?: Record<string, string> };
  const values = body.values ?? {};

  const myFields = await prisma.field.findMany({ where: { agreementId: r.agreementId, recipientId: r.id } });
  for (const f of myFields) {
    const v = values[f.id];
    if (f.required && (v === undefined || !String(v).trim())) {
      return NextResponse.json({ error: `missing required ${f.type} field` }, { status: 400 });
    }
  }
  for (const f of myFields) {
    const v = values[f.id];
    if (v !== undefined) await prisma.field.update({ where: { id: f.id }, data: { value: String(v) } });
  }

  await prisma.recipient.update({ where: { id: r.id }, data: { status: "SIGNED", signedAt: new Date() } });
  await recordAudit({
    action: "recipient.sign",
    actorEmail: r.email,
    resourceType: "AGREEMENT",
    resourceId: r.agreementId,
    ip: req.headers.get("x-forwarded-for"),
    userAgent: req.headers.get("user-agent"),
    metadata: { recipientId: r.id, fields: myFields.length },
  });

  await advanceRouting(r.agreementId);
  const completed = await maybeFinalizeAgreement(r.agreementId);

  return NextResponse.json({ ok: true, completed });
}
