/** Match a review issue title to a contract clause title (fuzzy). */
export function issueMatchesClause(issueTitle: string, clauseTitle: string): boolean {
  const t = issueTitle.toLowerCase().trim();
  const c = clauseTitle.toLowerCase().trim();
  if (!t || !c) return false;
  if (c.includes(t) || t.includes(c)) return true;
  return t.split(/\s+/).some((w) => w.length > 3 && c.includes(w));
}

export function clauseForIssue<T extends { id: string; title: string }>(
  clauses: T[],
  issueTitle: string,
): T | undefined {
  return (
    clauses.find((c) => issueMatchesClause(issueTitle, c.title)) ??
    clauses.find((c) => {
      const t = issueTitle.toLowerCase();
      return t.split(/\s+/).some((w) => w.length > 3 && c.title.toLowerCase().includes(w));
    })
  );
}
