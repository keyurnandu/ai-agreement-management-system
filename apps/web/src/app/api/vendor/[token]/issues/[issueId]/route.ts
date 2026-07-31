import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ token: string; issueId: string }> }) {
  const { token, issueId } = await ctx.params;
  const deal = await prisma.deal.findUnique({ where: { vendorAccessToken: token } });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const issue = await prisma.reviewIssue.findFirst({ where: { id: issueId, dealId: deal.id } });
  if (!issue) return NextResponse.json({ error: "issue not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { vendorResponse?: string; status?: string };
  // The vendor may respond to any issue, but may only mark RESOLVED an issue
  // they raised themselves — they can't unilaterally clear the org's compliance
  // (SYSTEM) or ORG-raised findings; the org confirms those.
  const canResolve = body.status === "RESOLVED" && issue.raisedBySide === "VENDOR";
  const updated = await prisma.reviewIssue.update({
    where: { id: issueId },
    data: {
      vendorResponse: body.vendorResponse ?? issue.vendorResponse,
      status: canResolve ? "RESOLVED" : issue.status,
      resolvedAt: canResolve ? new Date() : issue.resolvedAt,
    },
  });

  await recordAudit({
    action: "deal.issue.vendor_response",
    actorEmail: deal.vendorEmail,
    resourceType: "DEAL",
    resourceId: deal.id,
    metadata: { issueId, title: issue.title },
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ issue: updated });
}
