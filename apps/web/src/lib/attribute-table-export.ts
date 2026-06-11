/** Parse TABLE / JSON / markdown table values into rows for CSV export. */

export type ParsedTable = {
  columns: string[];
  rows: Record<string, string>[];
};

function slugHeader(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\w]+/g, "_")
    .replace(/^_|_$/g, "");
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim().replace(/\\\|/g, "|"));
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
}

/** Parse markdown pipe table (optionally with footer like _(2 line items)_). */
export function parseMarkdownTable(value: string): ParsedTable | null {
  const lines = value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && !l.startsWith("_("));

  if (lines.length < 2) return null;

  const headerCells = splitMarkdownRow(lines[0]);
  if (headerCells.length === 0) return null;

  const columns = headerCells.map((h, i) => slugHeader(h) || `col_${i + 1}`);
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const cells = splitMarkdownRow(line);
    if (cells.length === 0 || isSeparatorRow(cells)) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < columns.length; i++) {
      row[columns[i]] = cells[i] ?? "";
    }
    rows.push(row);
  }

  return rows.length > 0 ? { columns, rows } : null;
}

/** Parse JSON `{ items: [...] }` or a bare array of objects. */
export function parseJsonTable(value: string): ParsedTable | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;

  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    try {
      data = JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  let items: Record<string, unknown>[] = [];
  if (Array.isArray(data)) {
    items = data.filter((x): x is Record<string, unknown> => x != null && typeof x === "object" && !Array.isArray(x));
  } else if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
    items = ((data as { items: unknown[] }).items ?? []).filter(
      (x): x is Record<string, unknown> => x != null && typeof x === "object" && !Array.isArray(x),
    );
  }

  if (items.length === 0) return null;

  const preferred = ["sku", "product_name", "description", "quantity", "unit_price", "year", "total_price"];
  const keySet = new Set<string>();
  for (const item of items) {
    for (const k of Object.keys(item)) keySet.add(slugHeader(k) || k);
  }
  const columns = [...preferred.filter((k) => keySet.has(k)), ...[...keySet].filter((k) => !preferred.includes(k)).sort()];

  const rows = items.map((item) => {
    const row: Record<string, string> = {};
    for (const col of columns) {
      const raw = item[col] ?? item[col.replace(/_/g, " ")] ?? findKey(item, col);
      row[col] = raw == null ? "" : String(raw);
    }
    return row;
  });

  return { columns, rows };
}

function findKey(item: Record<string, unknown>, col: string): unknown {
  const target = col.toLowerCase();
  for (const [k, v] of Object.entries(item)) {
    if (slugHeader(k) === target || k.toLowerCase() === target) return v;
  }
  return undefined;
}

/** Parse tab-separated values (first row = headers). */
export function parseTsvTable(value: string): ParsedTable | null {
  const lines = value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines[0].includes("\t")) return null;

  const headerCells = lines[0].split("\t").map((c) => c.trim());
  const columns = headerCells.map((h, i) => slugHeader(h) || `col_${i + 1}`);
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const cells = line.split("\t");
    if (cells.every((c) => !c.trim())) continue;
    const row: Record<string, string> = {};
    for (let i = 0; i < columns.length; i++) row[columns[i]] = (cells[i] ?? "").trim();
    rows.push(row);
  }

  return rows.length > 0 ? { columns, rows } : null;
}

/** Parse structured attribute value into tabular rows. */
export function parseStructuredAttributeValue(value: string | null, type: string): ParsedTable | null {
  if (!value || value === "N/A") return null;
  const t = type.toUpperCase();

  if (t === "JSON") return parseJsonTable(value) ?? parseMarkdownTable(value);
  if (t === "TABLE") return parseMarkdownTable(value) ?? parseJsonTable(value);
  if (t === "MULTILINE") {
    return parseMarkdownTable(value) ?? parseTsvTable(value) ?? parseJsonTable(value);
  }
  if (value.trim().startsWith("{") || value.trim().startsWith("[")) return parseJsonTable(value);
  if (value.includes("|")) return parseMarkdownTable(value);
  if (value.includes("\t")) return parseTsvTable(value);
  return null;
}

export type ExportFormat = "summary" | "table_rows";

export function buildAttributeExportCsv(
  attrs: {
    key: string;
    label: string;
    type: string;
    value: string | null;
    confidence: number | null;
    method: string | null;
    source: { page: number; snippet: string } | null;
  }[],
  format: ExportFormat,
  toCsv: (rows: Record<string, string>[], columns: string[]) => string,
): { csv: string; filenameSuffix: string } {
  const selected = attrs;

  if (format === "summary") {
    const rows = selected.map((a) => ({
      key: a.key,
      label: a.label,
      value: a.value ?? "",
      type: a.type,
      method: a.method ?? "",
      confidence: a.confidence != null ? String(Math.round(a.confidence * 100)) : "",
      page: a.source?.page != null ? String(a.source.page) : "",
      source_snippet: a.source?.snippet ?? "",
    }));
    return {
      csv: toCsv(rows, ["key", "label", "value", "type", "method", "confidence", "page", "source_snippet"]),
      filenameSuffix: "attributes",
    };
  }

  // table_rows — expand TABLE / JSON / markdown into one CSV row per line item
  const tableAttrs = selected.filter((a) => parseStructuredAttributeValue(a.value, a.type));
  const scalarAttrs = selected.filter((a) => !parseStructuredAttributeValue(a.value, a.type));

  const outRows: Record<string, string>[] = [];
  let columns: string[] = [];

  const onlyOneTable = tableAttrs.length === 1 && scalarAttrs.length === 0;
  const metaCols = onlyOneTable ? [] : ["attribute_key", "attribute_label"];

  for (const a of tableAttrs) {
    const parsed = parseStructuredAttributeValue(a.value, a.type)!;
    if (columns.length === 0) columns = [...metaCols, ...parsed.columns];
    else {
      for (const c of parsed.columns) {
        if (!columns.includes(c)) columns.push(c);
      }
    }
    for (const row of parsed.rows) {
      const out: Record<string, string> = {};
      if (!onlyOneTable) {
        out.attribute_key = a.key;
        out.attribute_label = a.label;
      }
      for (const c of columns) {
        if (c === "attribute_key" || c === "attribute_label") continue;
        out[c] = row[c] ?? "";
      }
      outRows.push(out);
    }
  }

  for (const a of scalarAttrs) {
    if (columns.length === 0) {
      columns = ["attribute_key", "attribute_label", "value", "type", "method", "confidence", "page"];
    }
    outRows.push({
      attribute_key: a.key,
      attribute_label: a.label,
      value: a.value ?? "",
      type: a.type,
      method: a.method ?? "",
      confidence: a.confidence != null ? String(Math.round(a.confidence * 100)) : "",
      page: a.source?.page != null ? String(a.source.page) : "",
    });
  }

  if (outRows.length === 0) {
    return buildAttributeExportCsv(attrs, "summary", toCsv);
  }

  return {
    csv: toCsv(outRows, columns.length ? columns : Object.keys(outRows[0])),
    filenameSuffix: onlyOneTable ? tableAttrs[0].key : "attributes_expanded",
  };
}
