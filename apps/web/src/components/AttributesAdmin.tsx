"use client";

import { useCallback, useEffect, useState } from "react";

type Attr = {
  id: string;
  key: string;
  label: string;
  group: string | null;
  type: string;
  documentType: string | null;
  mode: string;
  prompt: string;
  inclusionExamples: string[];
  exclusionExamples: string[];
  scope: string;
  active: boolean;
  updatedAt: string;
};
type FormState = {
  id?: string;
  label: string;
  group: string;
  type: string;
  documentType: string;
  mode: string;
  prompt: string;
  inclusion: string[];
  exclusion: string[];
};

const BLANK: FormState = {
  label: "",
  group: "",
  type: "TEXT",
  documentType: "",
  mode: "STRICT",
  prompt: "",
  inclusion: [],
  exclusion: [],
};
const TYPES = ["TEXT", "DATE", "NUMBER", "BOOLEAN", "ENUM"];

function ExampleRows({
  title,
  items,
  onChange,
}: {
  title: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div className="row">
        <span className="muted" style={{ fontSize: 12 }}>{title}</span>
        <button className="btn secondary" style={{ padding: "2px 8px" }} onClick={() => onChange([...items, ""])}>
          + Add
        </button>
      </div>
      {items.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <input
            className="input"
            value={v}
            onChange={(e) => {
              const a = [...items];
              a[i] = e.target.value;
              onChange(a);
            }}
          />
          <button className="btn secondary" style={{ padding: "2px 8px" }} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function AttributesAdmin({ canManage }: { canManage: boolean }) {
  const [attrs, setAttrs] = useState<Attr[] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [sample, setSample] = useState("");
  const [testVal, setTestVal] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/attributes");
    if (r.ok) setAttrs(((await r.json()) as { attributes: Attr[] }).attributes);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function editAttr(a: Attr) {
    setMsg(null);
    setTestVal(null);
    setForm({
      id: a.id,
      label: a.label,
      group: a.group ?? "",
      type: a.type,
      documentType: a.documentType ?? "",
      mode: a.mode,
      prompt: a.prompt,
      inclusion: a.inclusionExamples ?? [],
      exclusion: a.exclusionExamples ?? [],
    });
  }

  async function save() {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = {
        label: form.label,
        group: form.group || null,
        type: form.type,
        documentType: form.documentType || null,
        mode: form.mode,
        prompt: form.prompt,
        inclusionExamples: form.inclusion.filter((x) => x.trim()),
        exclusionExamples: form.exclusion.filter((x) => x.trim()),
      };
      const r = form.id
        ? await fetch(`/api/attributes/${form.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/attributes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
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

  async function runTest() {
    if (!form) return;
    setTesting(true);
    setTestVal(null);
    try {
      const r = await fetch("/api/attributes/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label: form.label,
          type: form.type,
          prompt: form.prompt,
          mode: form.mode,
          inclusionExamples: form.inclusion,
          exclusionExamples: form.exclusion,
          sampleText: sample,
        }),
      });
      const j = (await r.json()) as { value?: string; error?: string };
      setTestVal(r.ok ? (j.value ?? "(no value)") : `error: ${j.error}`);
    } finally {
      setTesting(false);
    }
  }

  async function toggleActive(a: Attr) {
    await fetch(`/api/attributes/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: !a.active }),
    });
    await load();
  }

  if (!attrs) return <p className="muted">Loading…</p>;

  const groups = new Map<string, Attr[]>();
  for (const a of attrs) {
    const g = a.group ?? "Ungrouped";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(a);
  }

  return (
    <div className="grid" style={{ gridTemplateColumns: form ? "1fr 1fr" : "1fr", gap: 16, alignItems: "start" }}>
      {/* List grouped by attribute group */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <strong>{attrs.length} attributes</strong>
          {canManage ? (
            <button className="btn secondary" onClick={() => { setMsg(null); setTestVal(null); setForm({ ...BLANK }); }}>
              + New attribute
            </button>
          ) : null}
        </div>
        {[...groups.entries()].map(([g, list]) => (
          <div key={g}>
            <div style={{ padding: "8px 14px", background: "var(--panel-2)", fontSize: 12, color: "var(--muted)" }}>
              {g} · {list.length}
            </div>
            {list.map((a) => (
              <div key={a.id} className="row" style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
                <div>
                  <button
                    onClick={() => editAttr(a)}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: 13 }}
                  >
                    {a.label}
                  </button>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {a.type} · {a.mode.toLowerCase()}
                    {a.documentType ? ` · ${a.documentType}` : ""}
                  </div>
                </div>
                <input type="checkbox" checked={a.active} disabled={!canManage} onChange={() => toggleActive(a)} title="Enable" />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Create / edit form */}
      {form ? (
        <div className="card">
          <div className="row">
            <h2 style={{ margin: 0 }}>{form.id ? "Edit attribute" : "Create custom attribute"}</h2>
            <button className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => setForm(null)}>Close</button>
          </div>
          <p className="muted" style={{ fontSize: 12 }}>
            Define the data that matters and the AI will extract it across your documents.
          </p>

          <label className="label">Attribute name</label>
          <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Renewal Notice Period" />

          <div className="grid grid-2" style={{ gap: 10 }}>
            <div>
              <label className="label">Attribute group</label>
              <input className="input" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="e.g. Renewal" />
            </div>
            <div>
              <label className="label">Attribute type</label>
              <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Document type</label>
              <input className="input" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} placeholder="any" />
            </div>
            <div>
              <label className="label">Attribute mode</label>
              <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
                <option value="STRICT">Strict (verbatim)</option>
                <option value="FLEXIBLE">Flexible (infer)</option>
              </select>
            </div>
          </div>

          <label className="label">Detailed attribute description</label>
          <textarea
            className="input"
            rows={4}
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            placeholder="Describe what to extract, e.g. 'Number of days notice required before the contract auto-renews or terminates.'"
            style={{ fontFamily: "inherit" }}
          />

          <button className="btn secondary" style={{ marginTop: 12 }} onClick={() => setAdvanced((v) => !v)}>
            {advanced ? "▾" : "▸"} Advanced options
          </button>
          {advanced ? (
            <div style={{ marginTop: 8 }}>
              <ExampleRows title="Inclusion examples" items={form.inclusion} onChange={(n) => setForm({ ...form, inclusion: n })} />
              <ExampleRows title="Exclusion examples" items={form.exclusion} onChange={(n) => setForm({ ...form, exclusion: n })} />
            </div>
          ) : null}

          {/* Test */}
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <label className="label" style={{ marginTop: 0 }}>Test against sample text</label>
            <textarea className="input" rows={3} value={sample} onChange={(e) => setSample(e.target.value)} placeholder="Paste a contract snippet to test extraction…" style={{ fontFamily: "inherit" }} />
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn secondary" disabled={testing || !sample.trim()} onClick={runTest}>
                {testing ? "Testing…" : "Test"}
              </button>
              {testVal != null ? <span style={{ fontSize: 13 }}>→ <strong>{testVal}</strong></span> : null}
            </div>
          </div>

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
