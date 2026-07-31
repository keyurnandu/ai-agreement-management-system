import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { canAccessDeal } from "@/lib/procurement";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Only a deal that's actually under review can be approved — not a DRAFT/
  // WITH_VENDOR deal (no negotiated content yet) or one already past approval.
  // Mirrors the Approve button's visibility gate on the deal page.
  const deal = await prisma.deal.findUnique({ where: { id }, select: { status: true } });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  const REVIEWABLE = ["UNDER_REVIEW", "VENDOR_SUBMITTED", "ISSUES_OPEN"];
  if (!REVIEWABLE.includes(deal.status)) {
    return NextResponse.json(
      { error: `Can't approve a deal that's in ${deal.status.toLowerCase().replace(/_/g, " ")} — it must be under review first.` },
      { status: 400 },
    );
  }

  const open = await prisma.reviewIssue.count({ where: { dealId: id, status: "OPEN" } });
  if (open > 0) {
    return NextResponse.json({ error: `${open} open issue(s) must be resolved first` }, { status: 400 });
  }

  await prisma.deal.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
  await recordAudit({
    action: "deal.approve",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DEAL",
    resourceId: id,
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ ok: true });
}
