import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { latestVersion } from "@/lib/documents";
import { enforceExpiry } from "@/lib/agreements";

export const dynamic = "force-dynamic";

// Public, token-gated. Returns what this recipient needs to sign.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await prisma.recipient.findUnique({
    where: { accessToken: token },
    include: { agreement: { include: { document: { select: { title: true } } } } },
  });
  if (!r) return NextResponse.json({ error: "invalid or expired link" }, { status: 404 });

  const ag = r.agreement;
  const expired = await enforceExpiry(ag);
  const myFields = await prisma.field.findMany({ where: { agreementId: ag.id, recipientId: r.id } });
  const version = await latestVersion(ag.documentId);

  // First open marks VIEWED and moves the agreement into progress.
  if (!expired && r.status === "SENT") {
    await prisma.recipient.update({ where: { id: r.id }, data: { status: "VIEWED" } });
    if (ag.status === "SENT") {
      await prisma.agreement.update({ where: { id: ag.id }, data: { status: "IN_PROGRESS" } });
    }
    await recordAudit({
      action: "recipient.view",
      actorEmail: r.email,
      resourceType: "AGREEMENT",
      resourceId: ag.id,
      metadata: { recipientId: r.id },
    });
  }

  const myTurn = !expired && (r.status === "SENT" || r.status === "VIEWED");
  return NextResponse.json({
    agreementTitle: ag.title,
    documentTitle: ag.document.title,
    message: ag.message,
    recipient: { email: r.email, name: r.name, role: r.role },
    myTurn,
    alreadySigned: r.status === "SIGNED",
    expired,
    agreementStatus: expired ? "EXPIRED" : ag.status === "SENT" ? "IN_PROGRESS" : ag.status,
    pageCount: version?.pageCount ?? 0,
    fields: myFields.map((f) => ({
      id: f.id,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      required: f.required,
      value: f.value,
    })),
  });
}
