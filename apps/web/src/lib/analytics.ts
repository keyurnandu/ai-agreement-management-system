import { prisma } from "@/lib/db";

export interface Analytics {
  generatedAt: string;
  scope: "all" | "mine";
  totals: { agreements: number; documents: number; contracts: number; completed: number; completionRate: number };
  cycleTime: { avgDays: number | null; medianDays: number | null; count: number };
  agreementStatus: { status: string; count: number }[];
  funnel: { sent: number; viewed: number; signed: number; declined: number; total: number };
  volume: { week: string; count: number }[];
  contractsByTemplate: { name: string; count: number }[];
  upcoming: { kind: string; title: string; date: string; days: number }[];
  activity7d: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function weekBuckets(dates: Date[], n: number): { week: string; count: number }[] {
  const now = Date.now();
  const wk = 7 * 86400000;
  const buckets = Array.from({ length: n }, (_, i) => ({
    week: new Date(now - (n - 1 - i) * wk).toISOString().slice(5, 10),
    count: 0,
  }));
  for (const d of dates) {
    const age = Math.floor((now - new Date(d).getTime()) / wk);
    if (age >= 0 && age < n) buckets[n - 1 - age].count++;
  }
  return buckets;
}

async function computeRenewals(ownerId?: string): Promise<Analytics["upcoming"]> {
  const defs = await prisma.attributeDefinition.findMany({
    where: { key: { in: ["effective_date", "term_months"] } },
    select: { id: true, key: true },
  });
  if (defs.length < 2) return [];
  const idByKey = Object.fromEntries(defs.map((d) => [d.key, d.id]));

  const vals = await prisma.attributeValue.findMany({
    where: { definitionId: { in: defs.map((d) => d.id) }, documentId: { not: null } },
    select: { definitionId: true, documentId: true, value: true },
  });
  const byDoc: Record<string, { eff?: string; term?: string }> = {};
  for (const v of vals) {
    if (!v.documentId) continue;
    const slot = (byDoc[v.documentId] ??= {});
    if (v.definitionId === idByKey["effective_date"]) slot.eff = v.value ?? undefined;
    if (v.definitionId === idByKey["term_months"]) slot.term = v.value ?? undefined;
  }
  const docIds = Object.keys(byDoc);
  if (!docIds.length) return [];

  const docs = await prisma.document.findMany({
    where: { id: { in: docIds }, ...(ownerId ? { ownerId } : {}) },
    select: { id: true, title: true },
  });
  const now = Date.now();
  const out: Analytics["upcoming"] = [];
  for (const d of docs) {
    const s = byDoc[d.id];
    if (!s.eff || !s.term) continue;
    const eff = new Date(s.eff);
    const months = parseInt(s.term, 10);
    if (Number.isNaN(eff.getTime()) || Number.isNaN(months)) continue;
    const renewal = new Date(eff);
    renewal.setMonth(renewal.getMonth() + months);
    const days = Math.round((renewal.getTime() - now) / 86400000);
    if (days <= 180) out.push({ kind: "renewal", title: d.title, date: renewal.toISOString().slice(0, 10), days });
  }
  return out;
}

export async function getAnalytics(ownerId?: string): Promise<Analytics> {
  const agWhere = ownerId ? { ownerId } : {};
  const agreements = await prisma.agreement.findMany({
    where: agWhere,
    select: { id: true, title: true, status: true, sentAt: true, completedAt: true, createdAt: true, expiresAt: true },
  });
  const agIds = agreements.map((a) => a.id);

  const statusMap: Record<string, number> = {};
  for (const a of agreements) statusMap[a.status] = (statusMap[a.status] ?? 0) + 1;
  const STATUSES = ["DRAFT", "SENT", "IN_PROGRESS", "COMPLETED", "DECLINED", "VOIDED", "EXPIRED"];
  const agreementStatus = STATUSES.filter((s) => (statusMap[s] ?? 0) > 0).map((s) => ({ status: s, count: statusMap[s] }));

  const cycleDays = agreements
    .filter((a) => a.status === "COMPLETED" && a.sentAt && a.completedAt)
    .map((a) => (new Date(a.completedAt as Date).getTime() - new Date(a.sentAt as Date).getTime()) / 86400000)
    .filter((d) => d >= 0);
  const completed = statusMap["COMPLETED"] ?? 0;
  const everSent = agreements.filter((a) => a.sentAt || a.status !== "DRAFT").length;

  const recipients = agIds.length
    ? await prisma.recipient.findMany({ where: { agreementId: { in: agIds } }, select: { status: true } })
    : [];
  const rc: Record<string, number> = {};
  for (const r of recipients) rc[r.status] = (rc[r.status] ?? 0) + 1;
  const funnel = {
    total: recipients.length,
    sent: recipients.length - (rc["PENDING"] ?? 0),
    viewed: (rc["VIEWED"] ?? 0) + (rc["SIGNED"] ?? 0),
    signed: rc["SIGNED"] ?? 0,
    declined: rc["DECLINED"] ?? 0,
  };

  const documents = await prisma.document.count({ where: ownerId ? { ownerId } : {} });
  const contracts = await prisma.contract.findMany({
    where: ownerId ? { createdById: ownerId } : {},
    select: { template: { select: { name: true } } },
  });
  const tplMap: Record<string, number> = {};
  for (const c of contracts) {
    const n = c.template?.name ?? "(no template)";
    tplMap[n] = (tplMap[n] ?? 0) + 1;
  }
  const contractsByTemplate = Object.entries(tplMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const now = Date.now();
  const upcoming: Analytics["upcoming"] = [];
  for (const a of agreements) {
    if (a.expiresAt && (a.status === "SENT" || a.status === "IN_PROGRESS")) {
      const days = Math.round((new Date(a.expiresAt).getTime() - now) / 86400000);
      if (days <= 60) upcoming.push({ kind: "signing expiry", title: a.title, date: new Date(a.expiresAt).toISOString().slice(0, 10), days });
    }
  }
  upcoming.push(...(await computeRenewals(ownerId)));
  upcoming.sort((a, b) => a.days - b.days);

  const activity7d = await prisma.auditEvent.count({ where: { createdAt: { gte: new Date(now - 7 * 86400000) } } });

  return {
    generatedAt: new Date().toISOString(),
    scope: ownerId ? "mine" : "all",
    totals: {
      agreements: agreements.length,
      documents,
      contracts: contracts.length,
      completed,
      completionRate: everSent ? Math.round((completed / everSent) * 100) : 0,
    },
    cycleTime: {
      avgDays: cycleDays.length ? round1(cycleDays.reduce((s, x) => s + x, 0) / cycleDays.length) : null,
      medianDays: cycleDays.length ? round1(median(cycleDays)) : null,
      count: cycleDays.length,
    },
    agreementStatus,
    funnel,
    volume: weekBuckets(
      agreements.map((a) => a.createdAt),
      8,
    ),
    contractsByTemplate,
    upcoming: upcoming.slice(0, 12),
    activity7d,
  };
}
