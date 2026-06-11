import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDeal } from "@/lib/procurement";
import { getDealActivity } from "@/lib/audit/deal-activity";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const events = await getDealActivity(id);
  return NextResponse.json({ events });
}
