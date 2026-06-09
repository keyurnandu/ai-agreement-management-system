/** Replace {{var}} placeholders with values; unknown/empty -> [var] so gaps are visible. */
export function substitute(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => {
    const v = vars[k];
    return v === undefined || v === null || v === "" ? `[${k}]` : String(v);
  });
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
    .forEach((c, i) => {
      lines.push(`${i + 1}. ${c.title.toUpperCase()}`);
      for (const l of wrap(c.body)) lines.push("   " + l);
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
