import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { getManageableAgreement, voidAgreement } from "@/lib/agreements";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const ag = await getManageableAgreement(actor, id);
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { reason?: string };

  try {
    await voidAgreement(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "cannot void agreement";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  await recordAudit({
    action: "agreement.void",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "AGREEMENT",
    resourceId: id,
    metadata: { previousStatus: ag.status, reason: body.reason?.trim() || null },
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ ok: true, status: "VOIDED" });
}
