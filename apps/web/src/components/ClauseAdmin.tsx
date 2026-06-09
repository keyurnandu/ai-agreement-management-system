"use client";

import { useCallback, useEffect, useState } from "react";

type Fallback = { label: string; text: string; riskLevel?: string };
type Clause = {
  id: string;
  key: string;
  title: string;
  category: string | null;
  body: string;
  fallbacks: Fallback[];
  active: boolean;
};

const EMPTY = { id: "", key: "", title: "", category: "", body: "", fallbacks: [] as Fallback[] };

export function ClauseAdmin({ canManage }: { canManage: boolean }) {
  const [clauses, setClauses] = useState<Clause[] | null>(null);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/clauses");
    if (r.ok) setClauses(((await r.json()) as { clauses: Clause[] }).clauses);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function editClause(c: Clause) {
    setMsg(null);
    setForm({ id: c.id, key: c.key, title: c.title, category: c.category ?? "", body: c.body, fallbacks: c.fallbacks ?? [] });
  }
  function newClause() {
    setMsg(null);
    setForm({ ...EMPTY });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        key: form.key,
        title: form.title,
        category: form.category || null,
        body: form.body,
        fallbacks: form.fallbacks,
      };
      const r = form.id
        ? await fetch(`/api/clauses/${form.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/clauses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      if (r.ok) {
        setForm(null);
        await load();
      } else {
        setMsg(((await r.json()) as { error?: string }).error ?? "error");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!clauses) return <p className="muted">Loading…</p>;

  return (
    <div className="grid" style={{ gridTemplateColumns: form ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <strong>{clauses.length} clauses</strong>
          {canManage ? (
            <button className="btn secondary" onClick={newClause}>
              + New clause
            </button>
          ) : null}
        </div>
        {clauses.map((c) => (
          <div key={c.id} className="row" style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
            <div>
              <strong style={{ fontSize: 14 }}>{c.title}</strong>
              <div className="muted" style={{ fontSize: 11 }}>
                {c.key} · {c.category ?? "—"} · {c.fallbacks?.length ?? 0} fallback(s)
              </div>
            </div>
            {canManage ? (
              <button className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => editClause(c)}>
                Edit
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {form ? (
        <div className="card">
          <h2>{form.id ? "Edit clause" : "New clause"}</h2>
          {!form.id ? (
            <>
              <label className="label" style={{ marginTop: 0 }}>
                Key (unique)
              </label>
              <input className="input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="e.g. indemnity" />
            </>
          ) : null}
          <label className="label">Title</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <label className="label">Category</label>
          <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <label className="label">Standard text (use {"{{variable}}"} placeholders)</label>
          <textarea className="input" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ fontFamily: "inherit" }} />

          <div className="row" style={{ marginTop: 14 }}>
            <strong style={{ fontSize: 13 }}>Approved fallbacks</strong>
            <button
              className="btn secondary"
              style={{ padding: "4px 10px" }}
              onClick={() => setForm({ ...form, fallbacks: [...form.fallbacks, { label: "", text: "", riskLevel: "low" }] })}
            >
              + Add
            </button>
          </div>
          {form.fallbacks.map((f, i) => (
            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 10, marginTop: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="input"
                  placeholder="label"
                  value={f.label}
                  onChange={(e) => {
                    const fb = [...form.fallbacks];
                    fb[i] = { ...f, label: e.target.value };
                    setForm({ ...form, fallbacks: fb });
                  }}
                />
                <input
                  className="input"
                  placeholder="risk (low/med/high)"
                  value={f.riskLevel ?? ""}
                  onChange={(e) => {
                    const fb = [...form.fallbacks];
                    fb[i] = { ...f, riskLevel: e.target.value };
                    setForm({ ...form, fallbacks: fb });
                  }}
                />
              </div>
              <textarea
                className="input"
                rows={2}
                placeholder="fallback text"
                value={f.text}
                onChange={(e) => {
                  const fb = [...form.fallbacks];
                  fb[i] = { ...f, text: e.target.value };
                  setForm({ ...form, fallbacks: fb });
                }}
                style={{ marginTop: 6, fontFamily: "inherit" }}
              />
              <button
                className="btn secondary"
                style={{ padding: "2px 8px", marginTop: 6 }}
                onClick={() => setForm({ ...form, fallbacks: form.fallbacks.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            </div>
          ))}

          {msg ? <p className="error">{msg}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn" disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button className="btn secondary" onClick={() => setForm(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
