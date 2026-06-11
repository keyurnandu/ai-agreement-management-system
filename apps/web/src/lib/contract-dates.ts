export function parseTermMonths(term: string | null | undefined): number | null {
  if (!term?.trim()) return null;
  const m = term.match(/(\d+)\s*(month|mo|yr|year)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n)) return null;
  return m[2].toLowerCase().startsWith("y") ? n * 12 : n;
}

export function computeEndDate(
  start: string | null | undefined,
  opts?: { termMonths?: string | null; subscriptionTerm?: string | null },
): string | null {
  if (!start?.trim()) return null;
  const startDate = new Date(start.trim());
  if (Number.isNaN(startDate.getTime())) return null;
  const months =
    (opts?.termMonths ? parseInt(opts.termMonths, 10) : NaN) ||
    parseTermMonths(opts?.subscriptionTerm ?? null);
  if (!months || Number.isNaN(months)) return null;
  const end = new Date(startDate);
  end.setMonth(end.getMonth() + months);
  return end.toISOString().slice(0, 10);
}
