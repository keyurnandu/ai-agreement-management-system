"use client";

import type { ClauseChange } from "@/lib/clause-diff";
import { parseStoredDiff } from "@/lib/clause-diff";
import { diffWords, isNoisyLineDiff, type DiffLine } from "@/lib/text-diff";

type Props = {
  summary: string | null;
  fromVersion: number | null;
  toVersion: number | null;
  lines: DiffLine[] | unknown;
  clauseChanges?: ClauseChange[];
};

function InlineWordDiff({ before, after }: { before: string; after: string }) {
  const spans = diffWords(before, after);
  const hasChanges = spans.some((s) => s.type !== "same");
  if (!hasChanges) return <p className="change-review-inline">{after}</p>;

  return (
    <p className="change-review-inline">
      {spans.map((s, i) => {
        if (s.type === "same") return <span key={i}>{s.text}</span>;
        if (s.type === "remove") {
          return (
            <span key={i} className="diff-remove">
              {s.text}
            </span>
          );
        }
        return (
          <span key={i} className="diff-add">
            {s.text}
          </span>
        );
      })}
    </p>
  );
}

export function ChangeReviewPanel({ summary, fromVersion, toVersion, lines, clauseChanges }: Props) {
  const parsed = parseStoredDiff(lines);
  const changes = clauseChanges ?? parsed.clauseChanges;
  const legacyLines = parsed.lines;

  if (!changes.length && !legacyLines.length && !summary) return null;

  const legacyNoisy = legacyLines.length > 0 && isNoisyLineDiff(legacyLines);
  const cleanSummary = summary && !summary.includes("**") ? summary : null;

  if (changes.length === 0 && legacyNoisy) return null;

  return (
    <div className="card change-review">
      <h2 style={{ marginTop: 0, fontSize: 15 }}>What changed</h2>
      {fromVersion && toVersion ? (
        <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
          Version {fromVersion} → {toVersion}
          {cleanSummary ? ` · ${cleanSummary}` : ""}
        </p>
      ) : cleanSummary ? (
        <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
          {cleanSummary}
        </p>
      ) : null}

      {changes.length > 0 ? (
        <div className="change-review-clauses">
          {changes.map((c) => (
            <div key={`${c.order}-${c.title}`} className="change-review-clause">
              <div className="change-review-clause-title">
                {c.order}. {c.title}
              </div>
              <div className="change-review-inline-wrap">
                <InlineWordDiff before={c.before} after={c.after} />
              </div>
            </div>
          ))}
        </div>
      ) : legacyNoisy ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Document was updated — open the <strong>Document</strong> tab to review the latest version.
        </p>
      ) : legacyLines.length > 0 ? (
        <pre className="change-review-lines">
          {legacyLines
            .filter((l) => l.type !== "same")
            .map((l, i) => (
              <div key={i} className={`change-line change-line-${l.type}`}>
                {l.type === "add" ? "+ " : "− "}
                {l.text || " "}
              </div>
            ))}
        </pre>
      ) : summary?.includes("**") ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Contract updated — open the Document tab to review the latest PDF.
        </p>
      ) : null}
    </div>
  );
}
