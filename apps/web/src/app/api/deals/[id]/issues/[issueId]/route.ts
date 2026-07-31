import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { canAccessDeal } from "@/lib/procurement";

export const dynamic = "force-dynamic";

const STATUSES = ["OPEN", "RESOLVED", "WAIVED"];

/** Org-side issue action: resolve (addressed), waive (accepted), or reopen. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; issueId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, issueId } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const issue = await prisma.reviewIssue.findUnique({ where: { id: issueId } });
  if (!issue || issue.dealId !== id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { status?: string; note?: string };
  const status = String(body.status ?? "").toUpperCase();
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "status must be OPEN, RESOLVED, or WAIVED" }, { status: 400 });
  }

  const resolved = status === "RESOLVED" || status === "WAIVED";
  const updated = await prisma.reviewIssue.update({
    where: { id: issueId },
    data: {
      status,
      resolvedAt: resolved ? new Date() : null,
      vendorResponse: body.note?.trim() ? `${issue.vendorResponse ? issue.vendorResponse + "\n" : ""}${session.user.email}: ${body.note.trim()}` : issue.vendorResponse,
    },
  });

  // If nothing is open anymore, move the deal back to review; else keep it flagged.
  const openLeft = await prisma.reviewIssue.count({ where: { dealId: id, status: "OPEN" } });
  const deal = await prisma.deal.findUnique({ where: { id }, select: { status: true } });
  if (deal && ["ISSUES_OPEN", "VENDOR_SUBMITTED", "UNDER_REVIEW"].includes(deal.status)) {
    await prisma.deal.update({ where: { id }, data: { status: openLeft ? "ISSUES_OPEN" : "UNDER_REVIEW" } });
  }

  await recordAudit({
    action: "deal.issue.update",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DEAL",
    resourceId: id,
    metadata: { issueId, status },
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ issue: updated, openLeft });
}
