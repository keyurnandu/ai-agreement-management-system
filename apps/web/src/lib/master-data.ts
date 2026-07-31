import { prisma } from "@/lib/db";
import { runExtraction } from "@/lib/extraction";
import { intelligence } from "@/lib/services/client";
import { allocateCommercialId } from "@/lib/commercial-types";
import type { Prisma, MasterProduct } from "@prisma/client";

export type ProductSide = "SALES" | "PROCUREMENT";
export type PricingModel = "LICENSED" | "CONSUMPTION";

export function normalizePricingModel(v: unknown): PricingModel | null {
  const s = String(v ?? "").toUpperCase();
  if (s.startsWith("CONSUM") || s.includes("CREDIT") || s.includes("USAGE")) return "CONSUMPTION";
  if (s.startsWith("LICEN") || s.includes("SEAT") || s.includes("SUBSCRIP")) return "LICENSED";
  return null;
}

/** Human-readable, sequential surrogate product code: PRD-1, PRD-2, … Unique,
 * searchable, and stable even when the manufacturer SKU/name changes. */
export function newProductCode(): Promise<string> {
  return allocateCommercialId("PRD");
}

export type MasterProductInput = {
  side?: string;
  name?: string;
  sku?: string | null;
  manufacturer?: string | null;
  family?: string | null;
  pricingModel?: string | null;
  quantity?: number | string | null;
  creditsPurchased?: number | string | null;
  unitPrice?: number | string | null;
  currency?: string | null;
  pricingNotes?: string | null;
  validFrom?: string | null; // ISO date (term start)
  validUntil?: string | null; // ISO date (term end)
  status?: string | null;
};

export function normalizeSide(v: unknown): ProductSide {
  return v === "PROCUREMENT" ? "PROCUREMENT" : "SALES";
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parsePrice(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Sanitize a currency code to letters only (defends the generated PDF against
 * markup injected via a non-ISO currency string). Defaults to USD. */
function cleanCurrency(v: string | null | undefined): string {
  return String(v ?? "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6) || "USD";
}

/** List products, optionally filtered by side and a free-text query. The catalog
 * is shared org-wide (every authenticated user reads it); pass `scopeToOwner`
 * only if a caller needs to restrict to a single owner. */
export async function listProducts(opts: {
  side?: ProductSide;
  q?: string;
  ownerId?: string;
  scopeToOwner?: boolean;
}): Promise<MasterProduct[]> {
  const where: Prisma.MasterProductWhereInput = {};
  if (opts.side) where.side = opts.side;
  if (opts.scopeToOwner && opts.ownerId) where.ownerId = opts.ownerId;
  const q = opts.q?.trim();
  if (q) {
    where.OR = [
      { skuId: { contains: q } },
      { name: { contains: q } },
      { sku: { contains: q } },
      { manufacturer: { contains: q } },
      { family: { contains: q } },
    ];
  }
  return prisma.masterProduct.findMany({ where, orderBy: [{ side: "asc" }, { updatedAt: "desc" }] });
}

/** Build the writable fields from an input payload (create or patch). */
function toData(input: MasterProductInput): Partial<Prisma.MasterProductUncheckedCreateInput> {
  const data: Partial<Prisma.MasterProductUncheckedCreateInput> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.sku !== undefined) data.sku = input.sku?.trim() || null;
  if (input.manufacturer !== undefined) data.manufacturer = input.manufacturer?.trim() || null;
  if (input.family !== undefined) data.family = input.family?.trim() || null;
  if (input.pricingModel !== undefined) data.pricingModel = input.pricingModel ? normalizePricingModel(input.pricingModel) : null;
  if (input.quantity !== undefined) data.quantity = parsePrice(input.quantity);
  if (input.creditsPurchased !== undefined) data.creditsPurchased = parsePrice(input.creditsPurchased);
  if (input.pricingNotes !== undefined) data.pricingNotes = input.pricingNotes?.trim() || null;
  if (input.currency !== undefined) data.currency = cleanCurrency(input.currency);
  if (input.unitPrice !== undefined) data.unitPrice = parsePrice(input.unitPrice);
  if (input.validFrom !== undefined) data.validFrom = parseDate(input.validFrom);
  if (input.validUntil !== undefined) data.validUntil = parseDate(input.validUntil);
  if (input.status !== undefined) data.status = input.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
  return data;
}

export async function createProduct(input: MasterProductInput, ownerId: string): Promise<MasterProduct> {
  const data = toData(input);
  return prisma.masterProduct.create({
    data: {
      skuId: await newProductCode(),
      side: normalizeSide(input.side),
      name: data.name || "Untitled product",
      sku: data.sku ?? null,
      manufacturer: data.manufacturer ?? null,
      family: data.family ?? null,
      pricingModel: data.pricingModel ?? null,
      quantity: data.quantity ?? null,
      creditsPurchased: data.creditsPurchased ?? null,
      unitPrice: data.unitPrice ?? null,
      currency: data.currency ?? "USD",
      pricingNotes: data.pricingNotes ?? null,
      validFrom: data.validFrom ?? null,
      validUntil: data.validUntil ?? null,
      status: data.status ?? "ACTIVE",
      method: "MANUAL",
      ownerId,
    },
  });
}

export async function updateProduct(id: string, input: MasterProductInput): Promise<MasterProduct> {
  return prisma.masterProduct.update({ where: { id }, data: toData(input) });
}

export async function deleteProduct(id: string): Promise<void> {
  await prisma.masterProduct.delete({ where: { id } });
}

/** Money formatter used in tables and contract line items. */
export function formatMoney(amount: number | null | undefined, currency = "USD"): string {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function validityLabel(p: Pick<MasterProduct, "validFrom" | "validUntil">): string {
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null);
  const from = fmt(p.validFrom);
  const until = fmt(p.validUntil);
  if (from && until) return `${from} – ${until}`;
  if (until) return `until ${until}`;
  if (from) return `from ${from}`;
  return "—";
}

// ── Sales line items (products picked into a contract) ────────────────────────

export type LineItem = {
  productId?: string;
  sku?: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice?: number | null;
  currency?: string;
};

export function normalizeLineItems(raw: unknown): LineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): LineItem | null => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const name = String(o.name ?? o.sku ?? "").trim();
      if (!name) return null;
      const qty = Number(o.quantity);
      return {
        productId: o.productId ? String(o.productId) : undefined,
        sku: o.sku ? String(o.sku) : undefined,
        name,
        description: o.description ? String(o.description) : undefined,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unitPrice: parsePrice(o.unitPrice as number | string | null),
        currency: cleanCurrency(o.currency as string | null),
      };
    })
    .filter((x): x is LineItem => x !== null);
}

/** Subtotal per currency — never sums across currencies (which would be
 * meaningless / wrong on a generated contract). */
export function lineItemTotals(items: LineItem[]): { currency: string; total: number }[] {
  const byCurrency = new Map<string, number>();
  for (const i of items) {
    const cur = (i.currency || "USD").toUpperCase();
    byCurrency.set(cur, (byCurrency.get(cur) ?? 0) + (i.unitPrice ?? 0) * (i.quantity || 1));
  }
  return [...byCurrency.entries()].map(([currency, total]) => ({ currency, total }));
}

/** Build a line item from a catalog product the salesperson picked. */
export function lineItemFromProduct(p: MasterProduct, quantity = 1): LineItem {
  return {
    productId: p.id,
    sku: p.sku ?? undefined,
    name: p.name,
    description: p.pricingNotes ?? undefined,
    quantity,
    unitPrice: p.unitPrice,
    currency: p.currency,
  };
}

// ── Procurement import (extract products from a signed agreement) ─────────────

type ParsedRow = { sku?: string; name?: string; description?: string; quantity?: number; unitPrice?: number | null; currency?: string };

function currencyFromText(s: string): string | undefined {
  if (/[€]|eur\b/i.test(s)) return "EUR";
  if (/[£]|gbp\b/i.test(s)) return "GBP";
  if (/[$]|usd\b/i.test(s)) return "USD";
  return undefined;
}

/** Parse the `products_services` markdown table into structured rows. Maps
 * columns by header when present, else falls back to positional order. */
export function parseProductsTable(markdown: string): ParsedRow[] {
  if (!markdown?.trim()) return [];
  const lines = markdown.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes("|"));
  const cells = (l: string) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const isSeparator = (l: string) => /^[\s|:\-]+$/.test(l) && l.includes("-");
  const rows = lines.filter((l) => !isSeparator(l));
  if (rows.length === 0) return [];

  // Detect a header row to map columns; otherwise use positional defaults.
  let header: string[] | null = null;
  let bodyStart = 0;
  const first = cells(rows[0]).map((c) => c.toLowerCase());
  if (first.some((c) => /sku|product|item|name|description|qty|quantity|price/.test(c))) {
    header = first;
    bodyStart = 1;
  }
  const colIndex = (re: RegExp, fallback: number) => {
    if (!header) return fallback;
    const i = header.findIndex((h) => re.test(h));
    return i === -1 ? fallback : i;
  };
  const iSku = colIndex(/sku|item\s*#|part/, 0);
  const iName = colIndex(/product|name|item(?!\s*#)/, 1);
  const iDesc = colIndex(/desc/, 2);
  const iQty = colIndex(/qty|quantity/, 3);
  const iPrice = colIndex(/unit\s*price|price(?!.*ext)/, 4);

  const out: ParsedRow[] = [];
  for (let r = bodyStart; r < rows.length; r++) {
    const c = cells(rows[r]);
    if (c.length < 2) continue;
    const name = (c[iName] ?? "").replace(/\*\*/g, "").trim();
    const sku = (c[iSku] ?? "").replace(/\*\*/g, "").trim();
    if (!name && !sku) continue;
    const priceText = c[iPrice] ?? "";
    const qty = Number((c[iQty] ?? "").replace(/[^0-9.]/g, ""));
    out.push({
      sku: sku || undefined,
      name: name || undefined,
      description: (c[iDesc] ?? "").trim() || undefined,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : undefined,
      unitPrice: parsePrice(priceText),
      currency: currencyFromText(priceText),
    });
  }
  return out;
}

/** Collapse rows the map-reduce extractor repeats across document sections. */
function dedupeRows(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Set<string>();
  const out: ParsedRow[] = [];
  for (const r of rows) {
    const key = `${(r.sku ?? "").toLowerCase()}|${(r.name ?? "").toLowerCase()}`;
    if (key === "|" || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

type RichProduct = {
  name: string;
  sku: string | null;
  quantity: number | null;
  unitPrice: number | null;
  currency: string;
  startDate: string | null; // ISO
  endDate: string | null;
  pricingModel: PricingModel | null;
  creditsPurchased: number | null;
  notes: string | null;
};

/** Second pass: turn the extracted line-item table into structured products with
 * term dates, quantities, pricing model (licensed vs consumption), and credits. */
async function structureProducts(markdown: string): Promise<RichProduct[]> {
  const system =
    "You convert an extracted procurement line-item table into STRICT JSON — return ONLY a JSON array, no prose. " +
    "Merge rows that describe the same product. For each distinct product return an object: " +
    '{"name": string, "sku": string|null, "quantity": number|null (total users/licenses/seats/units), ' +
    '"unitPrice": number|null, "currency": string (3-letter, default "USD"), ' +
    '"startDate": string|null (yyyy-mm-dd), "endDate": string|null (yyyy-mm-dd), ' +
    '"pricingModel": "LICENSED"|"CONSUMPTION" (LICENSED = per-seat/user/subscription licenses; ' +
    "CONSUMPTION = usage/metered/prepaid-credits/true-up billing), " +
    '"creditsPurchased": number|null (prepaid credits/units bought in advance, consumption only), ' +
    '"notes": string|null (a short human summary)}. Parse dates and quantities out of any description text.';
  try {
    const { text } = await intelligence.complete("LINE ITEM TABLE:\n" + markdown, system, 1400);
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]) as unknown[];
    return arr
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .map((o) => ({
        name: String(o.name ?? "").trim(),
        sku: o.sku ? String(o.sku).trim() : null,
        quantity: parsePrice(o.quantity as number | string | null),
        unitPrice: parsePrice(o.unitPrice as number | string | null),
        currency: o.currency ? String(o.currency).toUpperCase().slice(0, 6) : "USD",
        startDate: o.startDate ? String(o.startDate) : null,
        endDate: o.endDate ? String(o.endDate) : null,
        pricingModel: normalizePricingModel(o.pricingModel),
        creditsPurchased: parsePrice(o.creditsPurchased as number | string | null),
        notes: o.notes ? String(o.notes).trim() : null,
      }))
      .filter((p) => p.name);
  } catch {
    return [];
  }
}

function dedupeRich(rows: RichProduct[]): RichProduct[] {
  const seen = new Set<string>();
  const out: RichProduct[] = [];
  for (const r of rows) {
    const key = `${(r.sku ?? "").toLowerCase()}|${r.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function productsMarkdownFor(documentId: string): Promise<string | null> {
  const def = await prisma.attributeDefinition.findUnique({ where: { key: "products_services" }, select: { id: true } });
  if (!def) return null;
  const val = await prisma.attributeValue.findFirst({
    where: { definitionId: def.id, documentId },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  });
  return val?.value?.trim() || null;
}

export type ImportResult = { imported: number; alreadyImported: boolean; note?: string };

/**
 * Extract product-level line items from a (typically signed) procurement
 * document and land them in the PROCUREMENT catalog as editable AI rows.
 * Idempotent per deal: with `replace`, prior AI rows for the deal are refreshed;
 * without it, an existing import is left untouched.
 */
export async function importProcurementProductsFromDeal(
  deal: { id: string; documentId: string; vendorName: string | null; direction: string },
  actorId: string,
  opts?: { replace?: boolean },
): Promise<ImportResult> {
  const existing = await prisma.masterProduct.count({ where: { sourceDealId: deal.id, method: "AI" } });
  if (existing > 0 && !opts?.replace) return { imported: 0, alreadyImported: true };

  let markdown = await productsMarkdownFor(deal.documentId);
  let rows = dedupeRows(markdown ? parseProductsTable(markdown) : []);
  if (rows.length === 0) {
    // Either not extracted yet, or a stale/empty value (e.g. a prior "N/A" that
    // predates the current document). (Re)run the targeted extraction and retry
    // so a stale attribute never masks real line items.
    try {
      await runExtraction(deal.documentId, ["products_services"]);
    } catch {
      /* extraction may be unavailable; fall through to empty */
    }
    markdown = await productsMarkdownFor(deal.documentId);
    rows = dedupeRows(markdown ? parseProductsTable(markdown) : []);
  }
  if (rows.length === 0) return { imported: 0, alreadyImported: false, note: "No line items found in the signed document." };

  // Structure the line items into rich products (term dates, quantity, pricing
  // model, prepaid credits). Fall back to the basic parsed rows if it fails.
  let rich = dedupeRich(markdown ? await structureProducts(markdown) : []);
  if (rich.length === 0) {
    rich = rows.map((r) => ({
      name: r.name || r.sku || "Unnamed product",
      sku: r.sku ?? null,
      quantity: r.quantity ?? null,
      unitPrice: r.unitPrice ?? null,
      currency: r.currency ?? "USD",
      startDate: null,
      endDate: null,
      pricingModel: null,
      creditsPurchased: null,
      notes: r.description ?? null,
    }));
  }

  // Pre-allocate PRD- codes up front, then swap the deal's rows in ONE
  // transaction so a mid-write failure can never leave the catalog half-wiped.
  const data = [];
  for (const r of rich) {
    data.push({
      skuId: await newProductCode(),
      side: "PROCUREMENT",
      name: r.name || r.sku || "Unnamed product",
      sku: r.sku ?? null,
      manufacturer: deal.vendorName ?? null,
      pricingModel: r.pricingModel ?? null,
      quantity: r.quantity ?? null,
      creditsPurchased: r.creditsPurchased ?? null,
      unitPrice: r.unitPrice ?? null,
      currency: r.currency ?? "USD",
      pricingNotes: r.notes ?? null,
      validFrom: parseDate(r.startDate),
      validUntil: parseDate(r.endDate),
      method: "AI",
      sourceDealId: deal.id,
      sourceDocumentId: deal.documentId,
      ownerId: actorId,
    });
  }
  await prisma.$transaction([
    prisma.masterProduct.deleteMany({ where: { sourceDealId: deal.id, method: "AI" } }),
    prisma.masterProduct.createMany({ data }),
  ]);
  return { imported: rich.length, alreadyImported: false };
}
