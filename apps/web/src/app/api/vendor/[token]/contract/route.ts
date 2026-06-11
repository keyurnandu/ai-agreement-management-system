import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { findContractForDeal } from "@/lib/commercial-link";
import { vendorCanNegotiate } from "@/lib/procurement";

export const dynamic = "force-dynamic";

/** Linked contract clauses the counterparty can edit in the portal. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const deal = await prisma.deal.findUnique({
    where: { vendorAccessToken: token },
    select: { id: true, status: true, contractId: true, direction: true },
  });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const contract = await findContractForDeal(deal.id);
  if (!contract) {
    return NextResponse.json({ contract: null, canEdit: false });
  }

  const rows = await prisma.contractClause.findMany({
    where: { contractId: contract.id },
    orderBy: { order: "asc" },
    select: { id: true, order: true, title: true, body: true },
  });

  return NextResponse.json({
    contract: { id: contract.id, title: contract.title, clauses: rows },
    canEdit: vendorCanNegotiate(deal.status),
    direction: deal.direction,
  });
}
