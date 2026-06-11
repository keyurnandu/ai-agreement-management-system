import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { normalizeClauseText } from "@/lib/authoring";
import { findContractForDeal } from "@/lib/commercial-link";
import { publishContractAsPdf } from "@/lib/contract-pdf";
import { issueMatchesClause } from "@/lib/issue-clause";
import { sendRevisionNotice } from "@/lib/adapters/email";
import { env } from "@/env";
import { vendorCanNegotiate } from "@/lib/procurement";

export const dynamic = "force-dynamic";

/** Counterparty edits a clause in-browser; PDF regenerates and org sees a text diff. */
export async function PATCH(req: Request, ctx: { params: Promise<{ token: string; clauseId: string }> }) {
  const { token, clauseId } = await ctx.params;
  const deal = await prisma.deal.findUnique({
    where: { vendorAccessToken: token },
    select: {
      id: true,
      title: true,
      status: true,
      ownerId: true,
      vendorEmail: true,
      vendorName: true,
      contractId: true,
    },
  });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!vendorCanNegotiate(deal.status)) {
    return NextResponse.json({ error: "editing not allowed in current status" }, { status: 400 });
  }

  const contract = await findContractForDeal(deal.id);
  if (!contract) return NextResponse.json({ error: "no linked contract" }, { status: 400 });

  const clause = await prisma.contractClause.findFirst({
    where: { id: clauseId, contractId: contract.id },
  });
  if (!clause) return NextResponse.json({ error: "clause not found" }, { status: 404 });

  const body = (await req.json()) as { body?: string; issueId?: string; note?: string };
  if (typeof body.body !== "string" || !body.body.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  const newBody = normalizeClauseText(body.body);
  const beforeBody = clause.body;

  await prisma.contractClause.update({
    where: { id: clauseId },
    data: { body: newBody, isDeviation: true },
  });

  let diff = null;
  let version = 1;
  try {
    const pub = await publishContractAsPdf({
      contractId: contract.id,
      actorId: deal.ownerId,
      note: `counterparty edit (${deal.vendorEmail})`,
      clauseChange: {
        order: clause.order,
        title: clause.title,
        before: beforeBody,
        after: newBody,
      },
    });
    diff = pub.diff;
    version = pub.version;
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "PDF update failed" }, { status: 500 });
  }

  await prisma.deal.update({ where: { id: deal.id }, data: { status: "VENDOR_SUBMITTED" } });

  const vendorResponse = body.note?.trim() || "Updated contract language in portal.";
  const openIssues = await prisma.reviewIssue.findMany({
    where: { dealId: deal.id, status: "OPEN" },
    select: { id: true, title: true },
  });
  const resolveIds = new Set<string>();
  if (body.issueId) resolveIds.add(body.issueId);
  for (const issue of openIssues) {
    if (issueMatchesClause(issue.title, clause.title)) resolveIds.add(issue.id);
  }
  if (resolveIds.size > 0) {
    await prisma.reviewIssue.updateMany({
      where: { id: { in: [...resolveIds] }, dealId: deal.id },
      data: { vendorResponse, status: "RESOLVED", resolvedAt: new Date() },
    });
  }

  await recordAudit({
    action: "deal.vendor_clause_edit",
    actorEmail: deal.vendorEmail,
    resourceType: "DEAL",
    resourceId: deal.id,
    metadata: { clauseId, issueId: body.issueId ?? null, version, diffSummary: diff?.summary ?? null },
    ...auditRequestMeta(req),
  });

  const owner = await prisma.user.findUnique({ where: { id: deal.ownerId }, select: { email: true } });
  if (owner?.email && diff?.summary) {
    try {
      await sendRevisionNotice({
        to: owner.email,
        dealTitle: deal.title,
        summary: diff.summary,
        dealUrl: `${env.APP_BASE_URL.replace(/\/$/, "")}/deals/${deal.id}`,
      });
    } catch {
      /* email optional */
    }
  }

  return NextResponse.json({
    ok: true,
    version,
    diff: diff
      ? {
          fromVersion: diff.fromVersion,
          toVersion: diff.toVersion,
          summary: diff.summary,
          lines: diff.lines,
        }
      : null,
  });
}
