export interface AttributeSource {
  page: number;
  snippet: string;
  start: number;
  end: number;
  /** Normalized 0..1 rect on the PDF page (for Page-view highlight). */
  rect?: { x: number; y: number; w: number; h: number };
  /** AcroForm field name when value lives in a form widget. */
  formField?: string;
}

export interface StoredAttributeSource extends AttributeSource {
  provider?: string;
}

const SNIPPET_PAD = 80;

function makeSource(page: number, text: string, start: number, end: number): AttributeSource {
  const padStart = Math.max(0, start - SNIPPET_PAD);
  const padEnd = Math.min(text.length, end + SNIPPET_PAD);
  let snippet = text.slice(padStart, padEnd).replace(/\s+/g, " ").trim();
  if (padStart > 0) snippet = "…" + snippet;
  if (padEnd < text.length) snippet = snippet + "…";
  return { page, snippet, start, end };
}

/** Locate where an extracted value appears in per-page contract text. */
export function findAttributeSource(
  value: string | null | undefined,
  pages: { page: number; text: string }[],
): AttributeSource | null {
  if (!value || value === "N/A") return null;
  let needle = value.trim();
  if (!needle) return null;

  // For tables, locate the first SKU-like token or first long word from a data row.
  if (needle.startsWith("|") || needle.includes("\n|")) {
    for (const line of needle.split("\n")) {
      const sku = line.match(/\|\s*([A-Z0-9][A-Z0-9.\-_]{2,})/i);
      if (sku && !/^(sku|product|description|quantity|unit|year|total|---)/i.test(sku[1])) {
        needle = sku[1];
        break;
      }
    }
  }

  for (const p of pages) {
    const idx = p.text.toLowerCase().indexOf(needle.toLowerCase());
    if (idx >= 0) return makeSource(p.page, p.text, idx, idx + needle.length);
  }

  const words = needle.split(/\s+/).filter((w) => w.length > 3);
  for (const p of pages) {
    for (const word of words) {
      const idx = p.text.toLowerCase().indexOf(word.toLowerCase());
      if (idx >= 0) return makeSource(p.page, p.text, idx, idx + word.length);
    }
  }

  return null;
}

export function encodeAttributeSource(provider: string, loc: AttributeSource | null): string {
  if (loc) return JSON.stringify({ provider, ...loc });
  return JSON.stringify({ provider });
}

export function parseAttributeSource(raw: string | null | undefined): StoredAttributeSource | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredAttributeSource;
    if (typeof parsed.page === "number" && typeof parsed.snippet === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

type FormFieldHit = { page: number; name: string | null; value: string | null; rect: number[] };
type PageSize = { page: number; width: number; height: number };

/** Try to locate value in AcroForm fields when flat text search fails. */
export function findAttributeSourceInForm(
  value: string | null | undefined,
  fields: FormFieldHit[],
  pageSizes: PageSize[],
): AttributeSource | null {
  if (!value || value === "N/A") return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;

  for (const f of fields) {
    const v = (f.value ?? "").trim();
    if (!v) continue;
    if (v.toLowerCase() === needle || v.toLowerCase().includes(needle) || needle.includes(v.toLowerCase())) {
      const sz = pageSizes.find((s) => s.page === f.page);
      if (!sz?.width || !sz?.height) continue;
      const [x0, y0, x1, y1] = f.rect;
      return {
        page: f.page,
        snippet: `${f.name ?? "field"}: ${v}`,
        start: 0,
        end: v.length,
        rect: {
          x: x0 / sz.width,
          y: y0 / sz.height,
          w: Math.max(0.02, (x1 - x0) / sz.width),
          h: Math.max(0.015, (y1 - y0) / sz.height),
        },
        formField: f.name ?? undefined,
      };
    }
  }
  return null;
}

export function toCsv(rows: Record<string, string>[], columns: string[]): string {
  const escape = (s: string) => {
    const v = s ?? "";
    // Always quote — tables contain commas, pipes, and newlines that break Excel/CSV parsers.
    return `"${v.replace(/"/g, '""')}"`;
  };
  const body = [columns.join(","), ...rows.map((row) => columns.map((c) => escape(row[c] ?? "")).join(","))].join("\n");
  return `\uFEFF${body}`;
}
