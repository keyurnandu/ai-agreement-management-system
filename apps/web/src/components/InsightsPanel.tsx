"use client";

import { useState } from "react";

type Risk = { title: string; severity: string; note: string };
type Analysis = { summary: string; risks: Risk[]; obligations: string[]; key_dates: string[]; provider: string };
type Ask = { answer: string; citations: { n: number; score: number; text: string }[]; provider: string };

const SEV: Record<string, string> = { high: "red", medium: "amber", low: "gray" };

export function InsightsPanel({ documentId }: { documentId: string }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [q, setQ] = useState("");
  const [ans, setAns] = useState<Ask | null>(null);
  const [asking, setAsking] = useState(false);

  async function analyze() {
    setAnalyzing(true);
    try {
      const r = await fetch(`/api/documents/${documentId}/analyze`, { method: "POST" });
      if (r.ok) setAnalysis((await r.json()) as Analysis);
    } finally {
      setAnalyzing(false);
    }
  }

  async function ask() {
    if (!q.trim()) return;
    setAsking(true);
    setAns(null);
    try {
      const r = await fetch(`/api/documents/${documentId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (r.ok) setAns((await r.json()) as Ask);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>AI insights</h2>
        <button className="btn" disabled={analyzing} onClick={analyze}>
          {analyzing ? "Analyzing…" : "Analyze contract"}
        </button>
      </div>

      {analysis ? (
        <>
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>via {analysis.provider}</p>
          <div className="grid grid-2" style={{ marginTop: 8 }}>
            <div>
              <h3 style={{ fontSize: 13, margin: "8px 0 4px" }}>Summary</h3>
              <p style={{ fontSize: 13 }}>{analysis.summary || "—"}</p>
              <h3 style={{ fontSize: 13, margin: "14px 0 4px" }}>Key dates</h3>
              {analysis.key_dates.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {analysis.key_dates.map((d, i) => (
                    <span key={i} className="pill">
                      {d}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>—</p>
              )}
            </div>
            <div>
              <h3 style={{ fontSize: 13, margin: "8px 0 4px" }}>Risks</h3>
              {analysis.risks.length ? (
                analysis.risks.map((r, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <span className={`badge ${SEV[r.severity] ?? "gray"}`}>{r.severity}</span>{" "}
                    <strong style={{ fontSize: 13 }}>{r.title}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.note}
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>No flags.</p>
              )}
              <h3 style={{ fontSize: 13, margin: "14px 0 4px" }}>Obligations</h3>
              {analysis.obligations.length ? (
                <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
                  {analysis.obligations.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ fontSize: 13 }}>—</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
          Run an analysis for a summary, risk flags, obligations, and key dates. Uses the configured AI provider
          (<code>mock</code> by default; set <code>AI_PROVIDER</code> + key in <code>.env</code> for real output).
        </p>
      )}

      <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
        <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Ask about this document</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="input"
            placeholder="e.g. What is the governing law?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") ask();
            }}
          />
          <button className="btn" disabled={asking || !q.trim()} onClick={ask}>
            {asking ? "…" : "Ask"}
          </button>
        </div>
        {ans ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{ans.answer}</p>
            {ans.citations.length ? (
              <>
                <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Citations</div>
                {ans.citations.map((c) => (
                  <div key={c.n} className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                    [{c.n}] ({c.score}) {c.text}…
                  </div>
                ))}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
