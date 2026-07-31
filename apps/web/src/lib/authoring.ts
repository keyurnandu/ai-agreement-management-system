/** Replace {{var}} placeholders with values; unknown/empty -> [var] so gaps are visible. */
import { formatClauseBodyToHtml } from "@/lib/clause-format";

export function substitute(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v === undefined || v === null || v === "" ? `[${k}]` : String(v);
  });
}

/** CSS applied when rendering contracts to PDF (keep in sync with pdf-engine contract-document). */
export const CONTRACT_DOCUMENT_CSS = `
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.45; color: #1a1a1a; margin: 0; }
.doc-title { font-size: 18pt; font-weight: 700; margin: 0 0 18pt 0; color: #111111; }
.clause { margin: 0 0 16pt 0; }
.clause-title { font-size: 11pt; font-weight: 700; margin: 0 0 6pt 0; color: #111111; }
.clause-body { font-size: 11pt; font-weight: 400; margin: 0; }
.clause-body p { margin: 0 0 8pt 0; white-space: pre-wrap; }
.clause-table { width: 100%; border-collapse: collapse; margin: 8pt 0 10pt 0; font-size: 10pt; }
.clause-table th, .clause-table td { border: 1px solid #cccccc; padding: 5pt 8pt; text-align: left; vertical-align: top; }
.clause-table th { background: #f3f4f6; font-weight: 700; }
`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Normalize clause text: consistent line breaks and spacing. */
export function normalizeClauseText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeClauseTitle(title: string): string {
  return normalizeClauseText(title);
}

/** Derive a unique-ish clause library key from a human title. */
export function slugifyClauseKey(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `clause-${Date.now()}`;
}

export type ContractLineItem = {
  sku?: string | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice?: number | null;
  currency?: string | null;
};

function money(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Render selected catalog products as a numbered "Products & Pricing" section. */
export function composeLineItemsHtml(items: ContractLineItem[], order: number): string {
  if (!items?.length) return "";
  const currency = items.find((i) => i.currency)?.currency ?? "USD";
  let total = 0;
  let hasPricing = false;
  const rows = items
    .map((i, idx) => {
      const qty = i.quantity || 1;
      const unit = i.unitPrice ?? null;
      const ext = unit != null ? unit * qty : null;
      if (ext != null) {
        total += ext;
        hasPricing = true;
      }
      const desc = i.description ? `<br/><span style="color:#666">${escapeHtml(i.description)}</span>` : "";
      return `<tr><td>${idx + 1}</td><td>${escapeHtml(i.sku ?? "")}</td><td>${escapeHtml(i.name)}${desc}</td><td>${qty}</td><td>${unit != null ? money(unit, currency) : "—"}</td><td>${ext != null ? money(ext, currency) : "—"}</td></tr>`;
    })
    .join("");
  const totalRow = hasPricing
    ? `<tr><td colspan="5" style="text-align:right;font-weight:700">Total</td><td style="font-weight:700">${money(total, currency)}</td></tr>`
    : "";
  return `<section class="clause"><div class="clause-title">${order}. Products &amp; Pricing</div><table class="clause-table"><thead><tr><th>#</th><th>SKU</th><th>Product</th><th>Qty</th><th>Unit Price</th><th>Extended</th></tr></thead><tbody>${rows}${totalRow}</tbody></table></section>`;
}

/** Structured HTML for consistent contract PDF rendering. */
export function composeContractHtml(
  title: string,
  clauses: { order: number; title: string; body: string }[],
  lineItems?: ContractLineItem[],
): string {
  const sortedClauses = [...clauses].sort((a, b) => a.order - b.order);
  const sections = sortedClauses
    .map((c) => {
      const clauseTitle = escapeHtml(normalizeClauseTitle(c.title));
      const body = formatClauseBodyToHtml(c.body);
      return `<section class="clause"><div class="clause-title">${c.order}. ${clauseTitle}</div><div class="clause-body">${body}</div></section>`;
    })
    .join("\n");
  const nextOrder = (sortedClauses[sortedClauses.length - 1]?.order ?? sortedClauses.length) + 1;
  const products = lineItems?.length ? composeLineItemsHtml(lineItems, nextOrder) : "";
  const docTitle = escapeHtml(normalizeClauseTitle(title));
  return `<html><body><h1 class="doc-title">${docTitle}</h1>${sections}${products}</body></html>`;
}

/** Greedy word-wrap so the simple text renderer doesn't run off the page width. */
export function wrap(text: string, width = 95): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > width) {
        if (line) out.push(line.trim());
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    }
    out.push(line.trim());
  }
  return out;
}

/** Turn ordered contract clauses into the line list the engine's text-page renders. */
export function composeLines(clauses: { order: number; title: string; body: string }[]): string[] {
  const lines: string[] = [];
  [...clauses]
    .sort((a, b) => a.order - b.order)
    .forEach((c) => {
      lines.push(`${c.order}. ${normalizeClauseTitle(c.title)}`);
      for (const l of wrap(normalizeClauseText(c.body))) lines.push("   " + l);
      lines.push("");
    });
  return lines;
}

export interface TemplateVariable {
  key: string;
  label: string;
  type: string;
  required: boolean;
}
