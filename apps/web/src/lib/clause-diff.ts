import type { DiffLine } from "@/lib/text-diff";

export type ClauseChange = {
  order: number;
  title: string;
  before: string;
  after: string;
};

/** Stored in Deal.lastDiffLines — clause edits or legacy line array. */
export type StoredDiffPayload =
  | DiffLine[]
  | { clauseChanges: ClauseChange[]; lines?: DiffLine[] };

export function diffClauses(
  before: { order: number; title: string; body: string }[],
  after: { order: number; title: string; body: string }[],
): ClauseChange[] {
  const changes: ClauseChange[] = [];
  for (const a of after) {
    const b = before.find((x) => x.order === a.order) ?? before.find((x) => x.title === a.title);
    if (b && b.body.trim() !== a.body.trim()) {
      changes.push({ order: a.order, title: a.title, before: b.body, after: a.body });
    }
  }
  return changes;
}

export function summarizeClauseChanges(changes: ClauseChange[]): string {
  if (changes.length === 0) return "No text changes detected.";
  if (changes.length === 1) {
    const c = changes[0];
    return `Updated clause ${c.order}. ${c.title}`;
  }
  const names = changes.map((c) => `${c.order}. ${c.title}`).join(", ");
  return `Updated ${changes.length} clauses: ${names}`;
}

export function parseStoredDiff(raw: unknown): { clauseChanges: ClauseChange[]; lines: DiffLine[] } {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "clauseChanges" in raw) {
    const payload = raw as { clauseChanges?: ClauseChange[]; lines?: DiffLine[] };
    return {
      clauseChanges: payload.clauseChanges ?? [],
      lines: payload.lines ?? [],
    };
  }
  if (Array.isArray(raw)) {
    return { clauseChanges: [], lines: raw as DiffLine[] };
  }
  return { clauseChanges: [], lines: [] };
}

export function compactLineDiff(lines: DiffLine[], maxChanges = 24): DiffLine[] {
  const changed = lines.filter((l) => l.type !== "same");
  if (changed.length <= maxChanges) return changed;
  return changed.slice(0, maxChanges);
}
