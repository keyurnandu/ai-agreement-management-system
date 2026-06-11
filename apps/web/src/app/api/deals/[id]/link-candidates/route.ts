import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessDeal } from "@/lib/procurement";

export const dynamic = "force-dynamic";

/** Unlinked contracts that can be attached to this deal. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: dealId } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, dealId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { contractId: true } });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const rows = await prisma.contract.findMany({
    where: { dealId: null },
    include: { commercialType: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const contracts = rows
    .filter((c) => c.id !== deal.contractId)
    .map((c) => ({
      id: c.id,
      title: c.title,
      commercialId: c.commercialId,
      typePrefix: c.commercialType?.prefix ?? null,
    }));

  return NextResponse.json({ contracts });
}
