"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Var = { key: string; label: string; type: string; required: boolean };
type Tpl = { id: string; key: string; name: string; description: string | null; variables: Var[] | null; clauses: number };

export function NewContract() {
  const router = useRouter();
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [sel, setSel] = useState<Tpl | null>(null);
  const [title, setTitle] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/templates");
      if (r.ok) setTpls(((await r.json()) as { templates: Tpl[] }).templates);
    })();
  }, []);

  function pick(t: Tpl) {
    setSel(t);
    setTitle(t.name);
    const init: Record<string, string> = {};
    (t.variables ?? []).forEach((v) => {
      if (v.type === "date") init[v.key] = new Date().toISOString().slice(0, 10);
    });
    setVals(init);
  }

  async function create() {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ templateId: sel.id, title, variables: vals }),
      });
      if (r.ok) router.push(`/contracts/${((await r.json()) as { id: string }).id}`);
      else setErr(((await r.json()) as { error?: string }).error ?? "error");
    } finally {
      setBusy(false);
    }
  }

  if (!tpls) return <p className="muted">Loading templates…</p>;

  if (!sel) {
    return (
      <div className="grid grid-2">
        {tpls.length === 0 ? <p className="muted">No templates available.</p> : null}
        {tpls.map((t) => (
          <button key={t.id} className="card" style={{ textAlign: "left", cursor: "pointer" }} onClick={() => pick(t)}>
            <strong>{t.name}</strong>
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {t.description}
            </p>
            <span className="pill" style={{ marginTop: 8 }}>
              {t.clauses} clauses · {(t.variables ?? []).length} fields
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <button className="btn secondary" onClick={() => setSel(null)} style={{ marginBottom: 14 }}>
        ← choose another template
      </button>
      <div className="card">
        <h2>{sel.name}</h2>
        <label className="label" style={{ marginTop: 0 }}>
          Contract title
        </label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        {(sel.variables ?? []).map((v) => (
          <div key={v.key}>
            <label className="label">
              {v.label}
              {v.required ? " *" : ""}
            </label>
            <input
              className="input"
              type={v.type === "date" ? "date" : v.type === "number" ? "number" : "text"}
              value={vals[v.key] ?? ""}
              onChange={(e) => setVals((s) => ({ ...s, [v.key]: e.target.value }))}
            />
          </div>
        ))}
        {err ? <p className="error">{err}</p> : null}
        <button className="btn" disabled={busy} onClick={create} style={{ marginTop: 16, width: "100%" }}>
          {busy ? "Creating…" : "Create contract"}
        </button>
      </div>
    </div>
  );
}
