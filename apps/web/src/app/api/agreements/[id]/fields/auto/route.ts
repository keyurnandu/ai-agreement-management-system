import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getManageableAgreement } from "@/lib/agreements";
import { autoPlaceSignatureFields } from "@/lib/auto-signature-fields";
import { recordAudit, auditRequestMeta } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Place standard signature / name / title / date blocks on the signature page. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const ag = await getManageableAgreement(actor, id);
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (ag.status !== "DRAFT") return NextResponse.json({ error: "agreement already sent" }, { status: 409 });

  try {
    const result = await autoPlaceSignatureFields(id, actor.id);
    await recordAudit({
      action: "agreement.auto_signature_fields",
      actorId: actor.id,
      actorEmail: session.user.email,
      resourceType: "AGREEMENT",
      resourceId: id,
      metadata: result,
      ...auditRequestMeta(req),
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "auto-place failed" }, { status: 400 });
  }
}
