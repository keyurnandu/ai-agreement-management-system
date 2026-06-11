export type DiffLine = { type: "add" | "remove" | "same"; text: string };

export type DiffSpan = { type: "add" | "remove" | "same"; text: string };

function lcsDiff<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): DiffSpan[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffSpan[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      out.push({ type: "same", text: String(a[i]) });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "remove", text: String(a[i]) });
      i++;
    } else {
      out.push({ type: "add", text: String(b[j]) });
      j++;
    }
  }
  while (i < n) out.push({ type: "remove", text: String(a[i++]) });
  while (j < m) out.push({ type: "add", text: String(b[j++]) });
  return out;
}

/** Word-level diff — only changed words are marked add/remove. */
export function diffWords(before: string, after: string): DiffSpan[] {
  const tokenize = (s: string) => s.split(/(\s+)/).filter((t) => t.length > 0);
  return lcsDiff(tokenize(before), tokenize(after), (x, y) => x === y);
}

/** True when a PDF line diff is too large to be useful (formatting noise). */
export function isNoisyLineDiff(lines: DiffLine[]): boolean {
  const changed = lines.filter((l) => l.type !== "same");
  if (changed.length <= 6) return false;
  const adds = changed.filter((l) => l.type === "add").length;
  const removes = changed.filter((l) => l.type === "remove").length;
  if (adds > 8 && removes > 8) return true;
  return changed.length > 12;
}

/** Simple line-level diff for contract revision review. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  return lcsDiff(a, b, (x, y) => x === y) as DiffLine[];
}

export function diffStats(lines: DiffLine[]) {
  return {
    added: lines.filter((l) => l.type === "add").length,
    removed: lines.filter((l) => l.type === "remove").length,
  };
}
