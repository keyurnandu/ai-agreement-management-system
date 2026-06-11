import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { canAccessDeal } from "@/lib/procurement";
import { findContractForDeal } from "@/lib/commercial-link";
import { publishContractAsPdf } from "@/lib/contract-pdf";

export const dynamic = "force-dynamic";

/** Generate PDF from the deal's linked contract and attach it to this deal. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "EDITOR")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: dealId } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDeal(actor, dealId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { contractId: true } });
  const contract = deal?.contractId ? await findContractForDeal(dealId) : null;
  if (!contract) {
    return NextResponse.json({ error: "link a contract to this deal first" }, { status: 400 });
  }

  try {
    const { documentId, pageCount } = await publishContractAsPdf({
      contractId: contract.id,
      actorId: actor.id,
      note: "generated from linked contract",
    });
    await recordAudit({
      action: "deal.publish_contract_pdf",
      actorId: actor.id,
      actorEmail: session.user.email,
      resourceType: "DEAL",
      resourceId: dealId,
      metadata: { contractId: contract.id, documentId, pageCount },
      ...auditRequestMeta(req),
    });
    return NextResponse.json({ documentId, pageCount });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "generate failed" }, { status: 500 });
  }
}
