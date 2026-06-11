import { prisma } from "@/lib/db";
import { computeEndDate } from "@/lib/contract-dates";
import { dealStatusLabel } from "@/lib/procurement";
import { typeLabel } from "@/lib/commercial-types";

export type PortfolioPhase = "draft" | "executing" | "completed";

export type PortfolioRow = {
  id: string;
  kind: "deal" | "contract";
  commercialId: string | null;
  title: string;
  counterparty: string | null;
  recordType: string | null;
  phase: PortfolioPhase;
  status: string;
  statusLabel: string;
  startDate: string | null;
  endDate: string | null;
  contractValue: string | null;
  href: string;
};

export type PortfolioAnalytics = {
  direction: "ORG_SELLING" | "ORG_BUYING";
  generatedAt: string;
  counts: { draft: number; executing: number; completed: number; total: number };
  rows: PortfolioRow[];
};

const ATTR_KEYS = ["effective_date", "order_total", "subscription_term", "term_months", "term_end_date", "parties"] as const;

function dealPhase(status: string): PortfolioPhase {
  if (status === "COMPLETED") return "completed";
  if (status === "DRAFT") return "draft";
  return "executing";
}

function contractPhase(status: string): PortfolioPhase {
  if (status === "DRAFT") return "draft";
  return "executing";
}

function pickVar(vars: unknown, key: string): string | null {
  if (!vars || typeof vars !== "object") return null;
  const v = (vars as Record<string, unknown>)[key];
  return v === undefined || v === null || v === "" ? null : String(v);
}

function resolveDatesAndValue(
  docAttrs: Record<string, string | null>,
  variables: unknown,
): { startDate: string | null; endDate: string | null; contractValue: string | null } {
  const startDate = docAttrs.effective_date ?? pickVar(variables, "effective_date");
  const contractValue = docAttrs.order_total ?? pickVar(variables, "order_total");
  const endDate =
    docAttrs.term_end_date ??
    computeEndDate(startDate, {
      termMonths: docAttrs.term_months,
      subscriptionTerm: docAttrs.subscription_term ?? pickVar(variables, "subscription_term"),
    });
  return { startDate, endDate, contractValue };
}

async function loadDocAttributes(documentIds: string[]): Promise<Map<string, Record<string, string | null>>> {
  const out = new Map<string, Record<string, string | null>>();
  if (!documentIds.length) return out;

  const defs = await prisma.attributeDefinition.findMany({
    where: { key: { in: [...ATTR_KEYS] } },
    select: { id: true, key: true },
  });
  if (!defs.length) return out;
  const idByKey = Object.fromEntries(defs.map((d) => [d.key, d.id]));

  const vals = await prisma.attributeValue.findMany({
    where: { documentId: { in: documentIds }, definitionId: { in: defs.map((d) => d.id) } },
    select: { documentId: true, definitionId: true, value: true, method: true },
  });

  const byDocDef = new Map<string, (typeof vals)[number]>();
  for (const v of vals) {
    if (!v.documentId) continue;
    const k = `${v.documentId}:${v.definitionId}`;
    const cur = byDocDef.get(k);
    if (!cur || (v.method === "MANUAL" && cur.method !== "MANUAL")) byDocDef.set(k, v);
  }

  for (const docId of documentIds) {
    const slot: Record<string, string | null> = {};
    for (const key of ATTR_KEYS) {
      const defId = idByKey[key];
      if (!defId) continue;
      slot[key] = byDocDef.get(`${docId}:${defId}`)?.value ?? null;
    }
    out.set(docId, slot);
  }
  return out;
}

export async function getPortfolioAnalytics(
  direction: "ORG_SELLING" | "ORG_BUYING",
  ownerId?: string,
): Promise<PortfolioAnalytics> {
  const dealWhere = {
    direction,
    ...(ownerId ? { ownerId } : {}),
  };

  const [deals, orphanContracts, linkedContracts] = await Promise.all([
    prisma.deal.findMany({
      where: dealWhere,
      include: { commercialType: true },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.contract.findMany({
      where: {
        dealId: null,
        ...(ownerId ? { createdById: ownerId } : {}),
        commercialType: { direction },
      },
      include: { commercialType: true },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.contract.findMany({
      where: {
        dealId: { not: null },
        ...(ownerId ? { createdById: ownerId } : {}),
      },
      select: { id: true, dealId: true, variables: true, status: true },
    }),
  ]);

  const contractByDealId = new Map(linkedContracts.map((c) => [c.dealId!, c]));

  const docIds = [
    ...deals.map((d) => d.documentId),
    ...orphanContracts.map((c) => c.documentId).filter(Boolean) as string[],
  ];
  const attrsByDoc = await loadDocAttributes([...new Set(docIds)]);

  const rows: PortfolioRow[] = [];

  for (const d of deals) {
    const linked = d.contractId ? contractByDealId.get(d.contractId) : undefined;
    const docAttrs = attrsByDoc.get(d.documentId) ?? {};
    const { startDate, endDate, contractValue } = resolveDatesAndValue(docAttrs, linked?.variables);
    const counterparty =
      d.vendorName ??
      (direction === "ORG_SELLING" ? pickVar(linked?.variables, "customer") : pickVar(linked?.variables, "provider"));

    rows.push({
      id: d.id,
      kind: "deal",
      commercialId: d.commercialId,
      title: d.title,
      counterparty,
      recordType: d.commercialType ? typeLabel(d.commercialType) : null,
      phase: dealPhase(d.status),
      status: d.status,
      statusLabel: dealStatusLabel(d.status, d.direction),
      startDate,
      endDate,
      contractValue,
      href: `/deals/${d.id}`,
    });
  }

  for (const c of orphanContracts) {
    const docAttrs = c.documentId ? (attrsByDoc.get(c.documentId) ?? {}) : {};
    const { startDate, endDate, contractValue } = resolveDatesAndValue(docAttrs, c.variables);
    const counterparty =
      direction === "ORG_SELLING"
        ? pickVar(c.variables, "customer")
        : pickVar(c.variables, "provider");

    rows.push({
      id: c.id,
      kind: "contract",
      commercialId: c.commercialId,
      title: c.title,
      counterparty,
      recordType: c.commercialType ? typeLabel(c.commercialType) : null,
      phase: contractPhase(c.status),
      status: c.status,
      statusLabel: c.status,
      startDate,
      endDate,
      contractValue,
      href: `/contracts/${c.id}`,
    });
  }

  rows.sort((a, b) => {
    const ak = a.commercialId ?? a.title;
    const bk = b.commercialId ?? b.title;
    return bk.localeCompare(ak);
  });

  const counts = { draft: 0, executing: 0, completed: 0, total: rows.length };
  for (const r of rows) counts[r.phase]++;

  return {
    direction,
    generatedAt: new Date().toISOString(),
    counts,
    rows,
  };
}
