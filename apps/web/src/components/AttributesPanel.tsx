"use client";

import { useCallback, useEffect, useState } from "react";

type Attr = {
  key: string;
  label: string;
  type: string;
  prompt: string;
  value: string | null;
  confidence: number | null;
  method: string | null;
};

export function AttributesPanel({ documentId, canEdit }: { documentId: string; canEdit: boolean }) {
  const [attrs, setAttrs] = useState<Attr[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/documents/${documentId}/attributes`);
    if (r.ok) setAttrs(((await r.json()) as { attributes: Attr[] }).attributes);
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setBusy(true);
    try {
      await fetch(`/api/documents/${documentId}/extract`, { method: "POST" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function edit(a: Attr) {
    const v = window.prompt(`${a.label}:`, a.value ?? "");
    if (v === null) return;
    await fetch(`/api/documents/${documentId}/attributes`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: a.key, value: v }),
    });
    await load();
  }

  if (!attrs) {
    return (
      <div className="card">
        <h2>Attributes</h2>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row">
        <h2 style={{ margin: 0 }}>Attributes</h2>
        {canEdit ? (
          <button className="btn secondary" style={{ padding: "4px 10px" }} disabled={busy} onClick={run}>
            {busy ? "Extracting…" : "Run extraction"}
          </button>
        ) : null}
      </div>
      <div className="grid" style={{ gap: 10, marginTop: 12 }}>
        {attrs.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>No attributes defined.</p> : null}
        {attrs.map((a) => (
          <div key={a.key} className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 13 }}>{a.label}</div>
              <div style={{ fontSize: 13, color: a.value ? "var(--text)" : "var(--muted)" }}>{a.value ?? "—"}</div>
              <div className="muted" style={{ fontSize: 10 }}>
                {a.method ? a.method.toLowerCase() : "not extracted"}
                {a.confidence != null ? ` · ${(a.confidence * 100).toFixed(0)}%` : ""}
              </div>
            </div>
            {canEdit ? (
              <button className="btn secondary" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => edit(a)}>
                set
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
