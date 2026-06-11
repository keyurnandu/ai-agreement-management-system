import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Deals without a linked contract — for optional link when creating a contract. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const where = roleAtLeast(session.user.role, "MANAGER")
    ? { contractId: null, commercialId: { not: null } }
    : { contractId: null, commercialId: { not: null }, ownerId: session.user.id };

  const deals = await prisma.deal.findMany({
    where,
    include: { commercialType: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    deals: deals.map((d) => ({
      id: d.id,
      title: d.title,
      commercialId: d.commercialId,
      direction: d.direction,
      typePrefix: d.commercialType?.prefix ?? null,
      commercialTypeKey: d.commercialType?.key ?? null,
    })),
  });
}
