"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Clause = {
  id: string;
  order: number;
  title: string;
  body: string;
  isDeviation: boolean;
  sourceClauseId: string | null;
  fallbackLabels: string[];
};
type Data = {
  id: string;
  title: string;
  status: string;
  template: string | null;
  documentId: string | null;
  clauses: Clause[];
};

export function ContractView({ contractId }: { contractId: string }) {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/contracts/${contractId}`);
    if (r.ok) setD((await r.json()) as Data);
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!d) return <p className="muted">Loading…</p>;

  async function patchClause(clauseId: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch(`/api/contracts/${contractId}/clauses/${clauseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setEditId(null);
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    setBusy(true);
    try {
      const r = await fetch(`/api/contracts/${contractId}/generate`, { method: "POST" });
      if (r.ok) router.push(`/documents/${((await r.json()) as { documentId: string }).documentId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ margin: "8px 0 18px" }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{d.title}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {d.status} · from {d.template ?? "—"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {d.documentId ? (
            <Link href={`/documents/${d.documentId}`} className="btn">
              Open document →
            </Link>
          ) : null}
          <button className="btn secondary" disabled={busy} onClick={generate}>
            {busy ? "Generating…" : d.documentId ? "Regenerate" : "Generate document"}
          </button>
        </div>
      </div>

      {d.documentId ? (
        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
          A document exists. After editing clauses, click <strong>Regenerate</strong>, then{" "}
          <strong>Prepare for signature</strong> on the document.
        </p>
      ) : null}

      <div className="card">
        <h2>Clauses</h2>
        {d.clauses.map((c) => (
          <div key={c.id} style={{ marginBottom: 18, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div className="row">
              <strong style={{ fontSize: 14 }}>
                {c.order}. {c.title}
              </strong>
              {c.isDeviation ? <span className="badge amber">deviation</span> : <span className="badge gray">standard</span>}
            </div>

            {editId === c.id ? (
              <div style={{ marginTop: 8 }}>
                <textarea
                  className="input"
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn" disabled={busy} onClick={() => patchClause(c.id, { body: draft })}>
                    Save
                  </button>
                  <button className="btn secondary" onClick={() => setEditId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 13, whiteSpace: "pre-wrap", marginTop: 4, color: "var(--text)" }}>{c.body}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  <button
                    className="btn secondary"
                    style={{ padding: "4px 10px" }}
                    onClick={() => {
                      setEditId(c.id);
                      setDraft(c.body);
                    }}
                  >
                    Edit
                  </button>
                  {c.fallbackLabels.map((label, i) => (
                    <button
                      key={label}
                      className="btn secondary"
                      style={{ padding: "4px 10px" }}
                      disabled={busy}
                      onClick={() => patchClause(c.id, { fallbackIndex: i })}
                    >
                      Use: {label}
                    </button>
                  ))}
                  {c.isDeviation && c.sourceClauseId ? (
                    <button
                      className="btn secondary"
                      style={{ padding: "4px 10px" }}
                      disabled={busy}
                      onClick={() => patchClause(c.id, { reset: true })}
                    >
                      Reset to standard
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
