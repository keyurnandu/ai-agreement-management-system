import { prisma } from "@/lib/db";
import { pdfEngine } from "@/lib/services/client";
import { loadVersionBytes } from "@/lib/documents";
import { diffLines, diffStats, type DiffLine } from "@/lib/text-diff";
import type { ClauseChange, StoredDiffPayload } from "@/lib/clause-diff";
import { summarizeClauseChanges } from "@/lib/clause-diff";

export type VersionDiff = {
  fromVersion: number;
  toVersion: number;
  summary: string;
  lines: StoredDiffPayload;
  stats: { added: number; removed: number };
  clauseChanges?: ClauseChange[];
};

async function versionText(documentId: string, version: number): Promise<string | null> {
  const ver = await prisma.documentVersion.findUnique({
    where: { documentId_version: { documentId, version } },
  });
  if (!ver) return null;
  const bytes = await loadVersionBytes(ver.storageKey);
  const ex = await pdfEngine.extractText(bytes, ver.originalFilename ?? undefined);
  return ex.pages.map((p) => p.text).join("\n");
}

export async function computeVersionDiff(
  documentId: string,
  fromVersion: number,
  toVersion: number,
): Promise<VersionDiff | null> {
  const before = await versionText(documentId, fromVersion);
  const after = await versionText(documentId, toVersion);
  if (before === null || after === null) return null;

  const lines = diffLines(before, after);
  const stats = diffStats(lines);

  // Plain summary only — AI markdown dumps are noisy and break the UI.
  const summary = `${stats.added} line(s) added, ${stats.removed} line(s) removed.`;

  return { fromVersion, toVersion, summary, lines, stats };
}

/** Save a clause-level diff (preferred for in-app edits). */
export async function saveClauseChangeDiff(
  dealId: string,
  opts: {
    fromVersion: number;
    toVersion: number;
    change: ClauseChange;
  },
) {
  const clauseChanges = [opts.change];
  const summary = summarizeClauseChanges(clauseChanges);
  await saveDealDiff(dealId, {
    fromVersion: opts.fromVersion,
    toVersion: opts.toVersion,
    summary,
    lines: { clauseChanges },
    stats: { added: 1, removed: 1 },
    clauseChanges,
  });
}

export async function saveDealDiff(dealId: string, diff: VersionDiff) {
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      lastDiffFromVersion: diff.fromVersion,
      lastDiffToVersion: diff.toVersion,
      lastDiffSummary: diff.summary,
      lastDiffLines: diff.lines,
    },
  });
}
