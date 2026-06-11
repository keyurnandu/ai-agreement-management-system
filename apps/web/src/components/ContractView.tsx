"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClauseBody } from "@/components/ClauseBody";
import { slugifyClauseKey } from "@/lib/authoring";

type Clause = {
  id: string;
  order: number;
  title: string;
  body: string;
  isDeviation: boolean;
  sourceClauseId: string | null;
  fallbackLabels: string[];
};
type LibraryClause = { id: string; title: string; category: string | null; active: boolean };
type Data = {
  id: string;
  title: string;
  status: string;
  template: string | null;
  documentId: string | null;
  clauses: Clause[];
};

export function ContractClauses({ contractId, embedded }: { contractId: string; embedded?: boolean }) {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [library, setLibrary] = useState<LibraryClause[]>([]);
  const [pickId, setPickId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newBody, setNewBody] = useState("");
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const [keyTouched, setKeyTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const loadLibrary = useCallback(async () => {
    const r = await fetch("/api/clauses");
    if (r.ok) {
      const j = (await r.json()) as { clauses: LibraryClause[] };
      setLibrary((j.clauses ?? []).filter((c) => c.active));
    }
  }, []);

  const load = useCallback(async () => {
    const r = await fetch(`/api/contracts/${contractId}`);
    if (r.ok) setD((await r.json()) as Data);
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadLibrary();
  }, [loadLibrary]);

  if (!d) return <p className="muted">Loading contract…</p>;

  function resetNewForm() {
    setNewTitle("");
    setNewKey("");
    setNewCategory("");
    setNewBody("");
    setSaveToLibrary(true);
    setKeyTouched(false);
    setShowNew(false);
  }

  function onNewTitleChange(title: string) {
    setNewTitle(title);
    if (!keyTouched) setNewKey(slugifyClauseKey(title));
  }

  async function createLibraryEntry(key: string): Promise<{ id: string } | { error: string }> {
    let attempt = key.trim() || slugifyClauseKey(newTitle);
    for (let n = 0; n < 5; n++) {
      const r = await fetch("/api/clauses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: n === 0 ? attempt : `${attempt}-${n + 1}`,
          title: newTitle.trim(),
          category: newCategory.trim() || null,
          body: newBody,
        }),
      });
      if (r.ok) return (await r.json()) as { id: string };
      const err = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? "";
      if (r.status !== 409 || n === 4) return { error: err || "Could not save to clause library" };
    }
    return { error: "Could not save to clause library" };
  }

  async function addClauseToContract(payload: { sourceClauseId?: string; title?: string; body?: string }) {
    const r = await fetch(`/api/contracts/${contractId}/clauses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      setMsg(((await r.json()) as { error?: string }).error ?? "Add failed");
      return false;
    }
    await load();
    return true;
  }

  async function patchClause(clauseId: string, payload: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/clauses/${clauseId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        setEditId(null);
        await load();
      } else {
        setMsg(((await r.json()) as { error?: string }).error ?? "Update failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeClause(clauseId: string, title: string) {
    if (!window.confirm(`Remove clause "${title}" from this contract?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/clauses/${clauseId}`, { method: "DELETE" });
      if (r.ok) {
        if (editId === clauseId) setEditId(null);
        await load();
      } else {
        setMsg(((await r.json()) as { error?: string }).error ?? "Remove failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function addFromLibrary() {
    if (!pickId || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const ok = await addClauseToContract({ sourceClauseId: pickId });
      if (ok) setPickId("");
    } finally {
      setBusy(false);
    }
  }

  async function addNewClause() {
    if (!newTitle.trim() || !newBody.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (saveToLibrary) {
        const created = await createLibraryEntry(newKey);
        if ("error" in created) {
          setMsg(created.error);
          return;
        }
        const ok = await addClauseToContract({ sourceClauseId: created.id });
        if (ok) {
          await loadLibrary();
          resetNewForm();
          setMsg("Clause saved to library and added to this contract.");
        }
        return;
      }

      const ok = await addClauseToContract({ title: newTitle.trim(), body: newBody });
      if (ok) {
        resetNewForm();
        setMsg("One-off clause added to this contract.");
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
    <>
      {!embedded && d.documentId ? (
        <p className="lead">
          A document exists. After editing clauses, click <strong>Regenerate</strong> to refresh branding from{" "}
          <Link href="/settings/branding">Settings</Link>, then use the <strong>Document</strong> tab for signature prep.
        </p>
      ) : null}

      <div className={embedded ? "contract-document contract-embedded" : "card contract-document"}>
        {!embedded ? (
          <div className="row" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Clauses</h2>
            <button className="btn secondary" disabled={busy} onClick={() => void generate()}>
              {busy ? "Generating…" : d.documentId ? "Regenerate PDF" : "Generate document"}
            </button>
          </div>
        ) : (
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Contract clauses</h2>
            <button className="btn secondary" style={{ fontSize: 12, padding: "4px 10px" }} disabled={busy} onClick={() => void generate()}>
              {busy ? "…" : d.documentId ? "Regenerate PDF" : "Generate PDF"}
            </button>
          </div>
        )}

        <div className="card" style={{ padding: 12, marginBottom: 14, background: "var(--surface)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <select className="input" style={{ flex: "1 1 200px", margin: 0 }} value={pickId} onChange={(e) => setPickId(e.target.value)}>
              <option value="">Add clause from library…</option>
              {library.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.category ? ` (${c.category})` : ""}
                </option>
              ))}
            </select>
            <button type="button" className="btn secondary" disabled={!pickId || busy} onClick={() => void addFromLibrary()}>
              Add
            </button>
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => {
                if (showNew) resetNewForm();
                else {
                  setShowNew(true);
                  setMsg(null);
                }
              }}
            >
              {showNew ? "Cancel" : "+ New clause"}
            </button>
            <Link href="/settings/clauses" className="muted" style={{ fontSize: 12 }}>
              Manage library →
            </Link>
          </div>
          {showNew ? (
            <div style={{ marginTop: 10 }}>
              <label className="label" style={{ marginTop: 0 }}>
                Title
              </label>
              <input
                className="input"
                placeholder="e.g. Data processing addendum"
                value={newTitle}
                onChange={(e) => onNewTitleChange(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <label className="label">Category (optional)</label>
              <input
                className="input"
                placeholder="e.g. order, master, custom"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{ marginBottom: 8 }}
              />
              <label className="label">Clause text</label>
              <textarea
                className="input clause-body"
                rows={5}
                placeholder={'Use {{variable}} placeholders where needed.\n\nExample: Provider will process Customer data only as described in {{data_schedule}}.'}
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
              />
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} />
                Save to clause library (reuse on other contracts & templates)
              </label>
              {saveToLibrary ? (
                <>
                  <label className="label">Library key (unique)</label>
                  <input
                    className="input"
                    placeholder="e.g. data-processing-addendum"
                    value={newKey}
                    onChange={(e) => {
                      setKeyTouched(true);
                      setNewKey(e.target.value);
                    }}
                    style={{ marginBottom: 8 }}
                  />
                  <p className="muted" style={{ fontSize: 12, margin: "0 0 8px" }}>
                    Requires Manager role. Add fallbacks later under{" "}
                    <Link href="/settings/clauses">Settings → Clauses</Link>.
                  </p>
                </>
              ) : (
                <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
                  One-off only — not stored in the library.
                </p>
              )}
              <button
                type="button"
                className="btn"
                style={{ marginTop: 8 }}
                disabled={busy || !newTitle.trim() || !newBody.trim() || (saveToLibrary && !newKey.trim())}
                onClick={() => void addNewClause()}
              >
                {busy ? "Adding…" : saveToLibrary ? "Save to library & add" : "Add to contract"}
              </button>
            </div>
          ) : null}
          {msg ? (
            <p
              style={{
                fontSize: 12,
                margin: "8px 0 0",
                color: msg.includes("failed") || msg.includes("Could not") ? "var(--red)" : "var(--green)",
              }}
            >
              {msg}
            </p>
          ) : null}
        </div>

        {d.clauses.map((c) => (
          <div key={c.id} className="clause-block">
            <div className="row">
              <div className="clause-title">
                {c.order}. {c.title}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {c.isDeviation ? <span className="badge amber">deviation</span> : <span className="badge gray">standard</span>}
                <button
                  type="button"
                  className="btn secondary"
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  disabled={busy || d.clauses.length <= 1}
                  title={d.clauses.length <= 1 ? "At least one clause required" : "Remove clause"}
                  onClick={() => void removeClause(c.id, c.title)}
                >
                  Remove
                </button>
              </div>
            </div>

            {editId === c.id ? (
              <div style={{ marginTop: 8 }}>
                <textarea
                  className="input clause-body"
                  rows={4}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
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
                <ClauseBody text={c.body} />
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
    </>
  );
}

/** @deprecated Use ContractClauses inside RecordWorkspace */
export function ContractView({ contractId }: { contractId: string }) {
  return <ContractClauses contractId={contractId} />;
}
