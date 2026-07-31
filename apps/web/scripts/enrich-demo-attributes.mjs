/**
 * Enrich seeded demo documents with realistic extracted attribute values so the
 * analytics dashboard (upcoming renewals) and portfolio table (start/end/value)
 * look complete in a demo — without re-running the full seed.
 *
 * Idempotent: clears prior AI-method values for the targeted docs+defs first.
 * Run:  node scripts/enrich-demo-attributes.mjs   (from apps/web)
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const KEYS = ["effective_date", "term_months", "order_total", "governing_law", "term_end_date", "parties"];

// Deterministic spread so several renewals fall inside the next ~180 days from "now".
const PROFILES = [
  { eff: "2025-09-01", term: 12, val: "$48,000 USD" }, // renews ~Sep 2026
  { eff: "2024-10-01", term: 24, val: "$96,000 USD" }, // renews ~Oct 2026
  { eff: "2025-11-15", term: 12, val: "$150,000 USD" }, // renews ~Nov 2026
  { eff: "2026-01-15", term: 12, val: "$240,000 USD" }, // renews ~Jan 2027
  { eff: "2025-08-01", term: 12, val: "$72,000 USD" }, // renews ~Aug 2026
  { eff: "2024-12-01", term: 24, val: "$180,000 USD" }, // renews ~Dec 2026
  { eff: "2026-02-01", term: 36, val: "$540,000 USD" }, // long term (variety)
  { eff: "2025-07-01", term: 12, val: "$60,000 USD" }, // renews ~Jul 2026
];

function addMonths(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function pickVar(vars, key) {
  if (!vars || typeof vars !== "object") return null;
  const v = vars[key];
  return v === undefined || v === null || v === "" ? null : String(v);
}

export async function enrichDemoAttributes(prisma) {
  const defs = await prisma.attributeDefinition.findMany({
    where: { key: { in: KEYS } },
    select: { id: true, key: true },
  });
  const defByKey = Object.fromEntries(defs.map((d) => [d.key, d.id]));
  const missing = KEYS.filter((k) => !defByKey[k]);
  if (missing.length) console.log(`(note) attribute defs not found, skipping: ${missing.join(", ")}`);

  const deals = await prisma.deal.findMany({
    where: { documentId: { not: undefined } },
    select: { id: true, documentId: true, direction: true, vendorName: true, contractId: true, title: true },
  });
  const contracts = await prisma.contract.findMany({
    select: { id: true, documentId: true, variables: true, title: true },
  });
  const contractById = new Map(contracts.map((c) => [c.id, c]));

  // Build a list of documents to enrich, with their best source of truth.
  const targets = [];
  for (const d of deals) {
    if (!d.documentId) continue;
    const linked = d.contractId ? contractById.get(d.contractId) : null;
    targets.push({
      documentId: d.documentId,
      variables: linked?.variables ?? null,
      counterparty: d.vendorName ?? pickVar(linked?.variables, "customer") ?? pickVar(linked?.variables, "provider"),
      direction: d.direction,
    });
  }
  for (const c of contracts) {
    if (!c.documentId) continue;
    if (targets.some((t) => t.documentId === c.documentId)) continue;
    targets.push({
      documentId: c.documentId,
      variables: c.variables ?? null,
      counterparty: pickVar(c.variables, "customer") ?? pickVar(c.variables, "provider"),
      direction: null,
    });
  }

  const defIds = Object.values(defByKey);
  const docIds = [...new Set(targets.map((t) => t.documentId))];

  // Idempotent reset for AI-method values on these docs+defs.
  await prisma.attributeValue.deleteMany({
    where: { documentId: { in: docIds }, definitionId: { in: defIds }, method: "AI" },
  });

  let created = 0;
  let idx = 0;
  for (const t of targets) {
    const profile = PROFILES[idx % PROFILES.length];
    idx++;

    const effective = pickVar(t.variables, "effective_date") ?? profile.eff;
    const termMonths = String(profile.term);
    const endDate = addMonths(effective, profile.term);
    const orderTotal = pickVar(t.variables, "order_total") ?? profile.val;
    const governing = pickVar(t.variables, "governing_law") ?? "State of Delaware, USA";
    const parties = t.counterparty ? `Demo Corp Inc. and ${t.counterparty}` : "Demo Corp Inc.";

    const rows = [
      { key: "effective_date", value: effective },
      { key: "term_months", value: termMonths },
      { key: "term_end_date", value: endDate },
      { key: "governing_law", value: governing },
      { key: "parties", value: parties },
    ];
    if (orderTotal) rows.push({ key: "order_total", value: orderTotal });

    for (const r of rows) {
      const defId = defByKey[r.key];
      if (!defId) continue;
      await prisma.attributeValue.create({
        data: {
          definitionId: defId,
          documentId: t.documentId,
          value: r.value,
          confidence: 0.92,
          method: "AI",
          source: "p1 · demo-enriched",
        },
      });
      created++;
    }
  }

  console.log(`Enriched ${docIds.length} documents with ${created} attribute values.`);
}

// Allow running standalone:  node scripts/enrich-demo-attributes.mjs
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const prisma = new PrismaClient();
  enrichDemoAttributes(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
