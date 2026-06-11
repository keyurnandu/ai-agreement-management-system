import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessDeal } from "@/lib/procurement";
import { DEAL_TO_CONTRACT_TYPE_KEY, findContractForDeal } from "@/lib/commercial-link";

export const dynamic = "force-dynamic";

/** Deal context for creating a linked contract. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { commercialType: true },
  });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const contractTypeKey = deal.commercialType?.key ? DEAL_TO_CONTRACT_TYPE_KEY[deal.commercialType.key] : null;
  const linkedContract = await findContractForDeal(id);

  return NextResponse.json({
    id: deal.id,
    title: deal.title,
    commercialId: deal.commercialId,
    direction: deal.direction,
    vendorName: deal.vendorName,
    vendorEmail: deal.vendorEmail,
    commercialTypeKey: deal.commercialType?.key ?? null,
    contractTypeKey,
    hasLinkedContract: !!linkedContract,
    linkedContractId: linkedContract?.id ?? null,
  });
}
