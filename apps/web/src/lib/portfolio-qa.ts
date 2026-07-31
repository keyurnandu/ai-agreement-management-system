import { prisma } from "@/lib/db";
import { getPortfolioAnalytics, type PortfolioRow } from "@/lib/portfolio-analytics";
import type { QaResult, QaCitation } from "@/lib/document-qa";

type Direction = "ORG_SELLING" | "ORG_BUYING";

function parseMoney(v: string | null): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - Date.now()) / 86400000);
}
function horizonDays(q: string): number {
  const m = q.match(/(\d+)\s*(day|week|month|year)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    return unit === "day" ? n : unit === "week" ? n * 7 : unit === "month" ? n * 30 : n * 365;
  }
  if (/quarter/.test(q)) return 90;
  return 90;
}
function cite(rows: PortfolioRow[]): QaCitation[] {
  return rows.slice(0, 8).map((r, i) => ({
    n: i + 1,
    score: 1,
    text: r.title,
    docTitle: r.commercialId ?? r.title,
    href: r.href,
  }));
}

/** Analytical Q&A over the deal + contract portfolio (structured, no LLM). */
export async function answerAboutPortfolio(direction: Direction, question: string, ownerId?: string): Promise<QaResult> {
  const q = question.toLowerCase();
  const pa = await getPortfolioAnalytics(direction, ownerId);
  const rows = pa.rows;
  const counterpartyWord = direction === "ORG_SELLING" ? "customer" : "vendor";

  // Open issues per deal (for "at risk").
  const dealIds = rows.filter((r) => r.kind === "deal").map((r) => r.id);
  const openIssues = dealIds.length
    ? await prisma.reviewIssue.findMany({ where: { dealId: { in: dealIds }, status: "OPEN" }, select: { dealId: true } })
    : [];
  const issuesByDeal = new Map<string, number>();
  for (const i of openIssues) issuesByDeal.set(i.dealId, (issuesByDeal.get(i.dealId) ?? 0) + 1);

  // ── Expiring / renewals ────────────────────────────────────────────────
  if (/expir|renew|expire|lapse|coming up|end date/.test(q)) {
    const n = horizonDays(q);
    const expiring = rows
      .map((r) => ({ r, days: daysUntil(r.endDate) }))
      .filter((x) => x.days !== null && x.days >= 0 && x.days <= n)
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
    if (!expiring.length) {
      return { answer: `No contracts expire within the next ${n} days.`, citations: [], provider: "portfolio data", routed: "portfolio" };
    }
    const lines = expiring.slice(0, 10).map((x) => `• ${x.r.commercialId ?? x.r.title} — ${x.r.title}: ${x.r.endDate} (${x.days}d)`).join("\n");
    return {
      answer: `${expiring.length} contract${expiring.length === 1 ? "" : "s"} expire within ${n} days:\n\n${lines}`,
      citations: cite(expiring.map((x) => x.r)),
      provider: "portfolio data",
      routed: "portfolio-expiring",
    };
  }

  // ── At risk / needs attention ──────────────────────────────────────────
  if (/risk|attention|problem|stuck|stalled|blocked|issue/.test(q)) {
    const risky = rows
      .map((r) => {
        const issues = r.kind === "deal" ? issuesByDeal.get(r.id) ?? 0 : 0;
        const days = daysUntil(r.endDate);
        const soon = days !== null && days >= 0 && days <= 60;
        return { r, issues, days, soon };
      })
      .filter((x) => x.issues > 0 || x.soon)
      .sort((a, b) => b.issues - a.issues);
    if (!risky.length) {
      return { answer: "No deals currently at risk — no open issues and nothing expiring in the next 60 days.", citations: [], provider: "portfolio data", routed: "portfolio" };
    }
    const lines = risky.slice(0, 10).map((x) => {
      const bits = [];
      if (x.issues) bits.push(`${x.issues} open issue${x.issues === 1 ? "" : "s"}`);
      if (x.soon) bits.push(`expires in ${x.days}d`);
      return `• ${x.r.commercialId ?? x.r.title} — ${x.r.title}: ${bits.join(", ")}`;
    }).join("\n");
    return {
      answer: `${risky.length} deal${risky.length === 1 ? "" : "s"} need attention:\n\n${lines}`,
      citations: cite(risky.map((x) => x.r)),
      provider: "portfolio data",
      routed: "portfolio-risk",
    };
  }

  // ── Value / pipeline ───────────────────────────────────────────────────
  if (/value|worth|total|revenue|spend|pipeline|amount|how much/.test(q)) {
    let filtered = rows;
    let scope = "";
    if (/sign|execut|flight|progress|active/.test(q)) { filtered = rows.filter((r) => r.phase === "executing"); scope = " in flight"; }
    else if (/draft/.test(q)) { filtered = rows.filter((r) => r.phase === "draft"); scope = " in draft"; }
    else if (/complet|closed|signed|done/.test(q)) { filtered = rows.filter((r) => r.phase === "completed"); scope = " completed"; }
    const withValue = filtered.filter((r) => parseMoney(r.contractValue) > 0);
    const total = withValue.reduce((s, r) => s + parseMoney(r.contractValue), 0);
    const lines = withValue
      .sort((a, b) => parseMoney(b.contractValue) - parseMoney(a.contractValue))
      .slice(0, 8)
      .map((r) => `• ${r.commercialId ?? r.title} — ${r.title}: ${r.contractValue}`)
      .join("\n");
    return {
      answer: `Total ${direction === "ORG_SELLING" ? "sales" : "procurement"} contract value${scope}: ${fmtMoney(total)} across ${withValue.length} deal${withValue.length === 1 ? "" : "s"}.${lines ? `\n\n${lines}` : ""}`,
      citations: cite(withValue),
      provider: "portfolio data",
      routed: "portfolio-value",
    };
  }

  // ── Counts by stage / status ───────────────────────────────────────────
  if (/how many|count|number of|stage|status|breakdown|distribution/.test(q)) {
    const c = pa.counts;
    return {
      answer: `${c.total} ${direction === "ORG_SELLING" ? "sales" : "procurement"} record${c.total === 1 ? "" : "s"}: ${c.draft} draft, ${c.executing} in flight, ${c.completed} completed.`,
      citations: [],
      provider: "portfolio data",
      routed: "portfolio-counts",
    };
  }

  // ── Default: portfolio summary ─────────────────────────────────────────
  const totalValue = rows.reduce((s, r) => s + parseMoney(r.contractValue), 0);
  const risky = rows.filter((r) => (r.kind === "deal" && (issuesByDeal.get(r.id) ?? 0) > 0)).length;
  const expiringSoon = rows.filter((r) => { const d = daysUntil(r.endDate); return d !== null && d >= 0 && d <= 90; }).length;
  return {
    answer:
      `${direction === "ORG_SELLING" ? "Sales" : "Procurement"} portfolio: ${pa.counts.total} records ` +
      `(${pa.counts.draft} draft, ${pa.counts.executing} in flight, ${pa.counts.completed} completed), ` +
      `~${fmtMoney(totalValue)} total value. ${risky} with open issues, ${expiringSoon} expiring within 90 days.\n\n` +
      `Try: "which deals are at risk?", "total value in flight?", "what's expiring in 90 days?", or ask about a specific ${counterpartyWord}.`,
    citations: [],
    provider: "portfolio data",
    routed: "portfolio-summary",
  };
}
