import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dealStatusLabel, vendorCanNegotiate } from "@/lib/procurement";
import { findContractForDeal } from "@/lib/commercial-link";
import { latestVersion } from "@/lib/documents";
import { parseStoredDiff } from "@/lib/clause-diff";

export const dynamic = "force-dynamic";

function dealDiff(deal: {
  lastDiffFromVersion: number | null;
  lastDiffToVersion: number | null;
  lastDiffSummary: string | null;
  lastDiffLines: unknown;
}) {
  if (!deal.lastDiffLines) return null;
  const parsed = parseStoredDiff(deal.lastDiffLines);
  if (!parsed.clauseChanges.length && !parsed.lines.length) return null;
  return {
    fromVersion: deal.lastDiffFromVersion,
    toVersion: deal.lastDiffToVersion,
    summary: deal.lastDiffSummary,
    lines: deal.lastDiffLines,
    clauseChanges: parsed.clauseChanges,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const deal = await prisma.deal.findUnique({
    where: { vendorAccessToken: token },
    include: { issues: { orderBy: { createdAt: "desc" } } },
  });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const ver = await latestVersion(deal.documentId);
  const linkedContract = await findContractForDeal(deal.id);
  let signUrl: string | null = null;
  if (deal.agreementId) {
    const recipient = await prisma.recipient.findFirst({
      where: { agreementId: deal.agreementId, email: deal.vendorEmail },
    });
    if (recipient?.accessToken) {
      signUrl = `${process.env.APP_BASE_URL ?? "http://localhost:3000"}/sign/${recipient.accessToken}`;
    }
  }

  return NextResponse.json({
    deal: {
      id: deal.id,
      title: deal.title,
      direction: deal.direction,
      status: deal.status,
      statusLabel: dealStatusLabel(deal.status, deal.direction),
      message: deal.message,
      documentId: deal.documentId,
      version: ver?.version ?? 1,
      pageCount: ver?.pageCount ?? 0,
      canUpload: vendorCanNegotiate(deal.status),
      canSign: deal.status === "SIGNING" && !!signUrl,
      signUrl,
      agreementId: deal.agreementId,
      hasContract: !!linkedContract,
      lastDiff: dealDiff(deal),
    },
    issues: deal.issues,
  });
}
