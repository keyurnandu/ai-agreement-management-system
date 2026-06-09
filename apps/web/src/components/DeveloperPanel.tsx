"use client";

import { useCallback, useEffect, useState } from "react";

type Key = { id: string; name: string; prefix: string; scopes: string[]; active: boolean; lastUsedAt: string | null; createdAt: string };
type Hook = { id: string; url: string; events: string[]; active: boolean; lastStatus: number | null; lastDeliveryAt: string | null };

function CheckList({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
      {options.map((o) => (
        <label key={o} className="muted" style={{ fontSize: 12, display: "inline-flex", gap: 4, alignItems: "center" }}>
          <input type="checkbox" checked={selected.includes(o)} onChange={() => onToggle(o)} />
          {o}
        </label>
      ))}
    </div>
  );
}

export function DeveloperPanel() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [keyForm, setKeyForm] = useState<{ name: string; scopes: string[] }>({ name: "", scopes: [] });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [hookForm, setHookForm] = useState<{ url: string; events: string[] }>({ url: "", events: [] });
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const k = await fetch("/api/keys");
    if (k.ok) {
      const j = (await k.json()) as { keys: Key[]; scopes: string[] };
      setKeys(j.keys);
      setScopes(j.scopes);
    }
    const w = await fetch("/api/webhooks");
    if (w.ok) {
      const j = (await w.json()) as { webhooks: Hook[]; events: string[] };
      setHooks(j.webhooks);
      setEvents(j.events);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function createKey() {
    if (!keyForm.name.trim()) return;
    setBusy(true);
    setCreatedKey(null);
    try {
      const r = await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(keyForm) });
      if (r.ok) {
        setCreatedKey(((await r.json()) as { key: string }).key);
        setKeyForm({ name: "", scopes: [] });
        await load();
      }
    } finally {
      setBusy(false);
    }
  }
  async function createHook() {
    if (!hookForm.url.trim()) return;
    setBusy(true);
    setCreatedSecret(null);
    try {
      const r = await fetch("/api/webhooks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(hookForm) });
      if (r.ok) {
        setCreatedSecret(((await r.json()) as { secret: string }).secret);
        setHookForm({ url: "", events: [] });
        await load();
      }
    } finally {
      setBusy(false);
    }
  }

  const tgl = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      {/* API keys */}
      <div className="card">
        <h2>API keys</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          Use with <code>Authorization: Bearer cpk_…</code> against <code>/api/v1</code>. See{" "}
          <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI</a>.
        </p>
        {(keys ?? []).map((k) => (
          <div key={k.id} className="row" style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
            <div>
              <strong style={{ fontSize: 13 }}>{k.name}</strong>
              <div className="muted" style={{ fontSize: 11 }}>
                {k.prefix}… · {(k.scopes ?? []).join(", ") || "no scopes"} · {k.lastUsedAt ? "used" : "unused"}
              </div>
            </div>
            <button className="btn secondary" style={{ padding: "2px 8px" }} onClick={() => fetch(`/api/keys/${k.id}`, { method: "DELETE" }).then(load)}>
              Revoke
            </button>
          </div>
        ))}
        {createdKey ? (
          <div className="card" style={{ marginTop: 10, background: "var(--panel-2)" }}>
            <div className="muted" style={{ fontSize: 11 }}>Copy now — shown once:</div>
            <code style={{ fontSize: 12, wordBreak: "break-all" }}>{createdKey}</code>
          </div>
        ) : null}
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <input className="input" placeholder="Key name" value={keyForm.name} onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })} />
          <CheckList options={scopes} selected={keyForm.scopes} onToggle={(v) => setKeyForm({ ...keyForm, scopes: tgl(keyForm.scopes, v) })} />
          <button className="btn" disabled={busy || !keyForm.name.trim()} onClick={createKey} style={{ marginTop: 10 }}>
            Create key
          </button>
        </div>
      </div>

      {/* Webhooks */}
      <div className="card">
        <h2>Webhooks</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          POST with <code>X-CP-Signature: sha256=HMAC(secret, body)</code>.
        </p>
        {(hooks ?? []).map((w) => (
          <div key={w.id} className="row" style={{ borderTop: "1px solid var(--border)", padding: "8px 0" }}>
            <div>
              <strong style={{ fontSize: 12, wordBreak: "break-all" }}>{w.url}</strong>
              <div className="muted" style={{ fontSize: 11 }}>
                {(w.events ?? []).join(", ")} · last: {w.lastStatus ?? "—"}
              </div>
            </div>
            <button className="btn secondary" style={{ padding: "2px 8px" }} onClick={() => fetch(`/api/webhooks/${w.id}`, { method: "DELETE" }).then(load)}>
              Delete
            </button>
          </div>
        ))}
        {createdSecret ? (
          <div className="card" style={{ marginTop: 10, background: "var(--panel-2)" }}>
            <div className="muted" style={{ fontSize: 11 }}>Signing secret — shown once:</div>
            <code style={{ fontSize: 12, wordBreak: "break-all" }}>{createdSecret}</code>
          </div>
        ) : null}
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <input className="input" placeholder="https://your-endpoint" value={hookForm.url} onChange={(e) => setHookForm({ ...hookForm, url: e.target.value })} />
          <CheckList options={events} selected={hookForm.events} onToggle={(v) => setHookForm({ ...hookForm, events: tgl(hookForm.events, v) })} />
          <button className="btn" disabled={busy || !hookForm.url.trim()} onClick={createHook} style={{ marginTop: 10 }}>
            Add webhook
          </button>
        </div>
      </div>
    </div>
  );
}
