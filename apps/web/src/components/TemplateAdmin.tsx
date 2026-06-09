"use client";

import { useCallback, useEffect, useState } from "react";

type Var = { key: string; label: string; type: string; required: boolean };
type ClauseRef = { id: string; key: string; title: string };
type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  variables: Var[] | null;
  clauses: number;
  active: boolean;
};
type FormState = {
  id?: string;
  key: string;
  name: string;
  description: string;
  active: boolean;
  variables: Var[];
  clauseIds: string[];
};

const BLANK: FormState = { key: "", name: "", description: "", active: true, variables: [], clauseIds: [] };

export function TemplateAdmin({ canManage }: { canManage: boolean }) {
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [clauses, setClauses] = useState<ClauseRef[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pick, setPick] = useState("");

  const load = useCallback(async () => {
    const [t, c] = await Promise.all([fetch("/api/templates?all=1"), fetch("/api/clauses")]);
    if (t.ok) setTemplates(((await t.json()) as { templates: TemplateRow[] }).templates);
    if (c.ok) setClauses(((await c.json()) as { clauses: ClauseRef[] }).clauses);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function editTemplate(id: string) {
    setMsg(null);
    const r = await fetch(`/api/templates/${id}`);
    if (!r.ok) return;
    const t = (await r.json()) as {
      id: string;
      key: string;
      name: string;
      description: string | null;
      active: boolean;
      variables: Var[] | null;
      clauses: ClauseRef[];
    };
    setForm({
      id: t.id,
      key: t.key,
      name: t.name,
      description: t.description ?? "",
      active: t.active,
      variables: t.variables ?? [],
      clauseIds: t.clauses.map((c) => c.id),
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        key: form.key,
        name: form.name,
        description: form.description || null,
        variables: form.variables,
        clauseIds: form.clauseIds,
        active: form.active,
      };
      const r = form.id
        ? await fetch(`/api/templates/${form.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
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

  async function toggleActive(t: TemplateRow) {
    await fetch(`/api/templates/${t.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !t.active }),
    });
    await load();
  }

  const titleFor = (id: string) => clauses.find((c) => c.id === id)?.title ?? id;
  const available = clauses.filter((c) => !form?.clauseIds.includes(c.id));

  if (!templates) return <p className="muted">Loading…</p>;

  return (
    <div className="grid" style={{ gridTemplateColumns: form ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
      {/* List */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <strong>{templates.length} templates</strong>
          {canManage ? (
            <button className="btn secondary" onClick={() => { setMsg(null); setForm({ ...BLANK }); }}>
              + New template
            </button>
          ) : null}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 11 }}>
              <th style={{ padding: "8px 14px" }}>Template</th>
              <th style={{ padding: "8px 14px" }}>Clauses</th>
              <th style={{ padding: "8px 14px" }}>Variables</th>
              <th style={{ padding: "8px 14px" }}>Enable</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 14px" }}>
                  <button
                    onClick={() => editTemplate(t.id)}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: 13 }}
                  >
                    {t.name}
                  </button>
                  <div className="muted" style={{ fontSize: 11 }}>{t.key}</div>
                </td>
                <td style={{ padding: "10px 14px" }} className="muted">{t.clauses}</td>
                <td style={{ padding: "10px 14px" }} className="muted">{(t.variables ?? []).length}</td>
                <td style={{ padding: "10px 14px" }}>
                  <input type="checkbox" checked={t.active} disabled={!canManage} onChange={() => toggleActive(t)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Editor */}
      {form ? (
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>{form.id ? "Edit template" : "New template"}</h2>
            <button className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => setForm(null)}>
              Close
            </button>
          </div>

          {!form.id ? (
            <>
              <label className="label">Key (unique)</label>
              <input className="input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="e.g. msa-standard" />
            </>
          ) : null}
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <label className="label">Description</label>
          <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ fontFamily: "inherit" }} />

          {/* Variables */}
          <div className="row" style={{ marginTop: 14 }}>
            <strong style={{ fontSize: 13 }}>Variables</strong>
            <button
              className="btn secondary"
              style={{ padding: "4px 10px" }}
              onClick={() => setForm({ ...form, variables: [...form.variables, { key: "", label: "", type: "text", required: true }] })}
            >
              + Add
            </button>
          </div>
          {form.variables.map((v, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
              <input className="input" placeholder="key" value={v.key} onChange={(e) => { const a = [...form.variables]; a[i] = { ...v, key: e.target.value }; setForm({ ...form, variables: a }); }} />
              <input className="input" placeholder="label" value={v.label} onChange={(e) => { const a = [...form.variables]; a[i] = { ...v, label: e.target.value }; setForm({ ...form, variables: a }); }} />
              <select className="input" value={v.type} onChange={(e) => { const a = [...form.variables]; a[i] = { ...v, type: e.target.value }; setForm({ ...form, variables: a }); }} style={{ width: 110 }}>
                <option value="text">text</option>
                <option value="date">date</option>
                <option value="number">number</option>
              </select>
              <label className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={v.required} onChange={(e) => { const a = [...form.variables]; a[i] = { ...v, required: e.target.checked }; setForm({ ...form, variables: a }); }} /> req
              </label>
              <button className="btn secondary" style={{ padding: "2px 8px" }} onClick={() => setForm({ ...form, variables: form.variables.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}

          {/* Clauses (ordered) */}
          <div className="row" style={{ marginTop: 16 }}>
            <strong style={{ fontSize: 13 }}>Clauses (in order)</strong>
          </div>
          {form.clauseIds.length === 0 ? <p className="muted" style={{ fontSize: 12 }}>No clauses yet.</p> : null}
          {form.clauseIds.map((cid, i) => (
            <div key={cid} className="row" style={{ marginTop: 6, alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>{i + 1}. {titleFor(cid)}</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button className="btn secondary" style={{ padding: "2px 8px" }} disabled={i === 0} onClick={() => { const a = [...form.clauseIds]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setForm({ ...form, clauseIds: a }); }}>↑</button>
                <button className="btn secondary" style={{ padding: "2px 8px" }} disabled={i === form.clauseIds.length - 1} onClick={() => { const a = [...form.clauseIds]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setForm({ ...form, clauseIds: a }); }}>↓</button>
                <button className="btn secondary" style={{ padding: "2px 8px" }} onClick={() => setForm({ ...form, clauseIds: form.clauseIds.filter((x) => x !== cid) })}>×</button>
              </div>
            </div>
          ))}
          {available.length ? (
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Add a clause…</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
              <button className="btn secondary" disabled={!pick} onClick={() => { setForm({ ...form, clauseIds: [...form.clauseIds, pick] }); setPick(""); }}>Add</button>
            </div>
          ) : null}

          <label className="muted" style={{ display: "block", marginTop: 14, fontSize: 13 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active (available in New contract)
          </label>

          {msg ? <p className="error">{msg}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn" disabled={busy || !canManage} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            <button className="btn secondary" onClick={() => setForm(null)}>Cancel</button>
          </div>
          {!canManage ? <p className="muted" style={{ fontSize: 12 }}>Manager access required to save.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
