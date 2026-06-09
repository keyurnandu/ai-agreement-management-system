"use client";

import { useState } from "react";

type Risk = { title: string; severity: string; note: string };
type Analysis = { summary: string; risks: Risk[]; obligations: string[]; key_dates: string[]; provider: string };
type Ask = { answer: string; citations: { n: number; score: number; text: string }[]; provider: string };
type Clause = { title: string; category: string; risk: string; text: string };
type Finding = { clause: string; status: string; note: string; suggestion: string };

const SEV: Record<string, string> = { high: "red", medium: "amber", low: "gray" };
const STATUS: Record<string, string> = { MISSING: "red", DEVIATES: "amber", PRESENT: "green", MATCH: "green" };

export function InsightsPanel({ documentId, versions = [] }: { documentId: string; versions?: number[] }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [clauses, setClauses] = useState<Clause[] | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [ans, setAns] = useState<Ask | null>(null);
  const [from, setFrom] = useState(versions[versions.length - 1] ?? 1);
  const [to, setTo] = useState(versions[0] ?? 1);
  const [diff, setDiff] = useState<string | null>(null);

  async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
    const r = await fetch(path, init);
    return r.ok ? ((await r.json()) as T) : null;
  }
  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>AI insights</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" disabled={!!busy} onClick={() => run("a", async () => setAnalysis(await call(`/api/documents/${documentId}/analyze`, { method: "POST" })))}>
            {busy === "a" ? "Analyzing…" : "Analyze"}
          </button>
          <button className="btn secondary" disabled={!!busy} onClick={() => run("c", async () => setClauses((await call<{ clauses: Clause[] }>(`/api/documents/${documentId}/classify`, { method: "POST" }))?.clauses ?? []))}>
            {busy === "c" ? "Classifying…" : "Classify clauses"}
          </button>
          <button className="btn secondary" disabled={!!busy} onClick={() => run("r", async () => setFindings((await call<{ findings: Finding[] }>(`/api/documents/${documentId}/redline`, { method: "POST" }))?.findings ?? []))}>
            {busy === "r" ? "Reviewing…" : "Redline vs standards"}
          </button>
        </div>
      </div>

      {analysis ? (
        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div>
            <h3 style={{ fontSize: 13, margin: "4px 0" }}>Summary <span className="muted" style={{ fontSize: 10 }}>via {analysis.provider}</span></h3>
            <p style={{ fontSize: 13 }}>{analysis.summary || "—"}</p>
            <h3 style={{ fontSize: 13, margin: "12px 0 4px" }}>Key dates</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {analysis.key_dates.length ? analysis.key_dates.map((d, i) => <span key={i} className="pill">{d}</span>) : <span className="muted" style={{ fontSize: 13 }}>—</span>}
            </div>
          </div>
          <div>
            <h3 style={{ fontSize: 13, margin: "4px 0" }}>Risks</h3>
            {analysis.risks.length ? analysis.risks.map((r, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <span className={`badge ${SEV[r.severity] ?? "gray"}`}>{r.severity}</span> <strong style={{ fontSize: 13 }}>{r.title}</strong>
                <div className="muted" style={{ fontSize: 12 }}>{r.note}</div>
              </div>
            )) : <p className="muted" style={{ fontSize: 13 }}>No flags.</p>}
            <h3 style={{ fontSize: 13, margin: "12px 0 4px" }}>Obligations</h3>
            {analysis.obligations.length ? <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>{analysis.obligations.map((o, i) => <li key={i}>{o}</li>)}</ul> : <p className="muted" style={{ fontSize: 13 }}>—</p>}
          </div>
        </div>
      ) : null}

      {clauses ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Clauses ({clauses.length})</h3>
          {clauses.map((c, i) => (
            <div key={i} className="row" style={{ alignItems: "flex-start", padding: "4px 0" }}>
              <div style={{ fontSize: 13 }}>{c.title}<div className="muted" style={{ fontSize: 11 }}>{c.category}</div></div>
              <span className={`badge ${SEV[c.risk] ?? "gray"}`}>{c.risk}</span>
            </div>
          ))}
        </div>
      ) : null}

      {findings ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Redline vs standard clauses</h3>
          {findings.map((f, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <span className={`badge ${STATUS[f.status] ?? "gray"}`}>{f.status}</span> <strong style={{ fontSize: 13 }}>{f.clause}</strong>
              <div className="muted" style={{ fontSize: 12 }}>{f.note}</div>
              {f.suggestion ? <div style={{ fontSize: 12, color: "var(--amber)" }}>↳ {f.suggestion}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {versions.length >= 2 ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Compare versions</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select className="input" style={{ width: 90 }} value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {versions.map((v) => <option key={v} value={v}>v{v}</option>)}
            </select>
            <span className="muted">→</span>
            <select className="input" style={{ width: 90 }} value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {versions.map((v) => <option key={v} value={v}>v{v}</option>)}
            </select>
            <button className="btn secondary" disabled={!!busy || from === to} onClick={() => run("d", async () => setDiff((await call<{ summary: string }>(`/api/documents/${documentId}/diff?from=${from}&to=${to}`))?.summary ?? "(no summary)"))}>
              {busy === "d" ? "Comparing…" : "Compare"}
            </button>
          </div>
          {diff ? <p style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 8 }}>{diff}</p> : null}
        </div>
      ) : null}

      <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <h3 style={{ fontSize: 13, margin: "0 0 6px" }}>Ask about this document</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="input" placeholder="e.g. What is the governing law?" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") run("q", async () => setAns(await call(`/api/documents/${documentId}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) }))); }} />
          <button className="btn" disabled={!!busy || !q.trim()} onClick={() => run("q", async () => setAns(await call(`/api/documents/${documentId}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) })))}>
            {busy === "q" ? "…" : "Ask"}
          </button>
        </div>
        {ans ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{ans.answer}</p>
            {ans.citations.map((c) => (
              <div key={c.n} className="muted" style={{ fontSize: 11, marginTop: 4 }}>[{c.n}] ({c.score}) {c.text}…</div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
