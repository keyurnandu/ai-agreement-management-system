import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getManageableAgreement } from "@/lib/agreements";

export const dynamic = "force-dynamic";

// Records a reminder. Locally this just audits; with a cloud email adapter it would
// re-send the signing links to outstanding recipients.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const ag = await getManageableAgreement(actor, id);
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ag.status !== "SENT" && ag.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "nothing to remind — agreement is not in progress" }, { status: 409 });
  }

  const pending = await prisma.recipient.findMany({
    where: { agreementId: id, status: { in: ["SENT", "VIEWED"] } },
  });

  await recordAudit({
    action: "agreement.remind",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: { reminded: pending.map((r) => r.email) },
  });

  return NextResponse.json({ ok: true, reminded: pending.length });
}
