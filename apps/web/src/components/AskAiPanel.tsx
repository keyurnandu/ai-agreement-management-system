"use client";

import { useState } from "react";

type Ask = { answer: string; citations: { n: number; score: number; text: string }[]; provider: string };

export function AskAiPanel({ documentId, onClose }: { documentId: string; onClose?: () => void }) {
  const [q, setQ] = useState("");
  const [ans, setAns] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/documents/${documentId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (r.ok) setAns((await r.json()) as Ask);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card doc-panel record-ask-card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Ask AI</h2>
        {onClose ? (
          <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={onClose}>
            Close
          </button>
        ) : null}
      </div>
      <div className="ask-row">
        <input
          className="input"
          placeholder="e.g. What is the governing law?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void ask();
          }}
        />
        <button className="btn" disabled={busy || !q.trim()} onClick={() => void ask()}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
      {ans ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, whiteSpace: "pre-wrap", margin: "0 0 8px" }}>{ans.answer}</p>
          {ans.citations.map((c) => (
            <div key={c.n} className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              [{c.n}] ({c.score}) {c.text}…
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
