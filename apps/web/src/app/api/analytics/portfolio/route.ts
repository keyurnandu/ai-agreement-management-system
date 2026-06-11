import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { roleAtLeast } from "@/lib/rbac";
import { getPortfolioAnalytics } from "@/lib/portfolio-analytics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const direction = new URL(req.url).searchParams.get("direction");
  if (direction !== "ORG_SELLING" && direction !== "ORG_BUYING") {
    return NextResponse.json({ error: "direction must be ORG_SELLING or ORG_BUYING" }, { status: 400 });
  }

  const ownerId = roleAtLeast(session.user.role, "MANAGER") ? undefined : session.user.id;
  const portfolio = await getPortfolioAnalytics(direction, ownerId);
  return NextResponse.json(portfolio);
}
