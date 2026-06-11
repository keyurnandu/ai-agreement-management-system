import { escapeHtml, normalizeClauseText } from "@/lib/authoring";

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
}

function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 2;
}

function markdownTableLinesToHtml(lines: string[]): string {
  if (lines.length < 2) return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");

  const headerCells = splitMarkdownRow(lines[0]);
  const bodyLines = lines.slice(1).filter((line) => {
    const cells = splitMarkdownRow(line);
    return !isSeparatorRow(cells);
  });

  if (!headerCells.length || !bodyLines.length) {
    return lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("");
  }

  const head = headerCells.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const rows = bodyLines
    .map((line) => {
      const cells = splitMarkdownRow(line);
      const tds = headerCells
        .map((_, i) => `<td>${escapeHtml(cells[i] ?? "")}</td>`)
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  return `<table class="clause-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/** Render clause text — markdown pipe tables become HTML tables; other text stays as paragraphs. */
export function formatClauseBodyToHtml(text: string): string {
  const lines = normalizeClauseText(text).split("\n");
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    if (isTableLine(lines[i])) {
      const block: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      parts.push(markdownTableLinesToHtml(block));
      continue;
    }

    if (!lines[i].trim()) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isTableLine(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    parts.push(`<p>${escapeHtml(para.join("\n"))}</p>`);
  }

  return parts.join("\n") || `<p>${escapeHtml(text)}</p>`;
}
