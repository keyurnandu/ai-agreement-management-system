// Sample SALES catalog — the products Adobe (the demo org) sells.
// Sample PROCUREMENT catalog — mirrors what the AI extractor lands from POR-1's
// signed order form (also demoable live via "Import products" on the deal).

export const SALES_PRODUCTS = [
  {
    name: "Acrobat Pro — Enterprise",
    sku: "ADB-ACRO-PRO",
    manufacturer: "Adobe Inc.",
    family: "Document Cloud",
    unitPrice: 199.0,
    currency: "USD",
    pricingNotes: "Per seat / year. Volume tier 1 (1–99 seats).",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  },
  {
    name: "Adobe Acrobat Sign — Enterprise",
    sku: "ADB-SIGN-ENT",
    manufacturer: "Adobe Inc.",
    family: "Document Cloud",
    unitPrice: 360.0,
    currency: "USD",
    pricingNotes: "Per seat / year. Unlimited transactions.",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  },
  {
    name: "Creative Cloud — All Apps (Enterprise)",
    sku: "ADB-CC-ALL",
    manufacturer: "Adobe Inc.",
    family: "Creative Cloud",
    unitPrice: 839.88,
    currency: "USD",
    pricingNotes: "Per seat / year. Family pricing applies at 500+ seats.",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  },
  {
    name: "Adobe Experience Manager — Sites",
    sku: "ADB-AEM-SITES",
    manufacturer: "Adobe Inc.",
    family: "Experience Cloud",
    unitPrice: null,
    currency: "USD",
    pricingNotes: "Custom — usage-based, quoted per engagement.",
    validFrom: "2026-01-01",
    validUntil: null,
  },
  {
    name: "Adobe Firefly — Enterprise",
    sku: "ADB-FIREFLY-ENT",
    manufacturer: "Adobe Inc.",
    family: "GenAI",
    unitPrice: 50.0,
    currency: "USD",
    pricingNotes: "Per seat / month. Includes commercial-safe generation credits.",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  },
];

// Procurement rows as captured from POR-1's signed order form (method AI, so the
// UI shows the "AI" provenance badge + source link, and they stay editable).
export const PROCUREMENT_PRODUCTS = [
  {
    name: "Claude API — token bundle",
    sku: "API-TOKENS",
    manufacturer: "Anthropic Technologies, LLC",
    family: "AI Platform",
    unitPrice: 10000.0,
    currency: "USD",
    pricingNotes: "50M tokens/month · 12-month commitment.",
    sourceCommercialId: "POR-1",
  },
  {
    name: "Premium API support",
    sku: "API-SUPPORT",
    manufacturer: "Anthropic Technologies, LLC",
    family: "AI Platform",
    unitPrice: null,
    currency: "USD",
    pricingNotes: "Business hours · bundled with the token commitment.",
    sourceCommercialId: "POR-1",
  },
];

// Sequential PRD-n product code from the shared commercial-id sequence.
async function allocatePrd(prisma) {
  return prisma.$transaction(async (tx) => {
    let seq = await tx.commercialIdSequence.findUnique({ where: { prefix: "PRD" } });
    if (!seq) seq = await tx.commercialIdSequence.create({ data: { prefix: "PRD", nextVal: 1 } });
    await tx.commercialIdSequence.update({ where: { prefix: "PRD" }, data: { nextVal: seq.nextVal + 1 } });
    return `PRD-${seq.nextVal}`;
  });
}

/** Idempotent: inserts each product only if no row on that side shares its SKU. */
export async function seedMasterProducts(prisma, ownerId) {
  let sales = 0;
  for (const p of SALES_PRODUCTS) {
    const exists = await prisma.masterProduct.findFirst({ where: { side: "SALES", sku: p.sku }, select: { id: true } });
    if (exists) continue;
    await prisma.masterProduct.create({
      data: {
        skuId: await allocatePrd(prisma),
        side: "SALES",
        name: p.name,
        sku: p.sku,
        manufacturer: p.manufacturer,
        family: p.family,
        unitPrice: p.unitPrice,
        currency: p.currency,
        pricingNotes: p.pricingNotes,
        validFrom: p.validFrom ? new Date(p.validFrom) : null,
        validUntil: p.validUntil ? new Date(p.validUntil) : null,
        method: "MANUAL",
        ownerId,
      },
    });
    sales += 1;
  }

  let proc = 0;
  for (const p of PROCUREMENT_PRODUCTS) {
    const exists = await prisma.masterProduct.findFirst({ where: { side: "PROCUREMENT", sku: p.sku }, select: { id: true } });
    if (exists) continue;
    const deal = p.sourceCommercialId
      ? await prisma.deal.findFirst({ where: { commercialId: p.sourceCommercialId }, select: { id: true, documentId: true } })
      : null;
    await prisma.masterProduct.create({
      data: {
        skuId: await allocatePrd(prisma),
        side: "PROCUREMENT",
        name: p.name,
        sku: p.sku,
        manufacturer: p.manufacturer,
        family: p.family,
        unitPrice: p.unitPrice,
        currency: p.currency,
        pricingNotes: p.pricingNotes,
        method: "AI",
        sourceDealId: deal?.id ?? null,
        sourceDocumentId: deal?.documentId ?? null,
        ownerId,
      },
    });
    proc += 1;
  }
  console.log(`  - master data: ${sales} sales + ${proc} procurement product(s) added`);
}
