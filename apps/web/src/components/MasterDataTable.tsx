"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Side = "SALES" | "PROCUREMENT";

type Product = {
  id: string;
  skuId: string | null;
  side: Side;
  name: string;
  sku: string | null;
  manufacturer: string | null;
  family: string | null;
  unitPrice: number | null;
  currency: string;
  pricingNotes: string | null;
  validFrom: string | null;
  validUntil: string | null;
  status: string;
  method: string;
  sourceLabel: string | null;
  sourceHref: string | null;
};

type Draft = {
  name: string;
  sku: string;
  manufacturer: string;
  family: string;
  unitPrice: string;
  currency: string;
  pricingNotes: string;
  validFrom: string;
  validUntil: string;
};

const EMPTY: Draft = { name: "", sku: "", manufacturer: "", family: "", unitPrice: "", currency: "USD", pricingNotes: "", validFrom: "", validUntil: "" };

function money(v: number | null, currency = "USD") {
  if (v === null || v === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}
function dateShort(v: string | null) {
  // Values are stored as date-only (UTC midnight); format in UTC to avoid an
  // off-by-one when the browser is behind UTC.
  return v ? new Date(v).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : null;
}
function validity(p: Product) {
  const f = dateShort(p.validFrom);
  const u = dateShort(p.validUntil);
  if (f && u) return `${f} – ${u}`;
  if (u) return `until ${u}`;
  if (f) return `from ${f}`;
  return "—";
}
function toDraft(p: Product): Draft {
  return {
    name: p.name,
    sku: p.sku ?? "",
    manufacturer: p.manufacturer ?? "",
    family: p.family ?? "",
    unitPrice: p.unitPrice != null ? String(p.unitPrice) : "",
    currency: p.currency ?? "USD",
    pricingNotes: p.pricingNotes ?? "",
    validFrom: p.validFrom ? p.validFrom.slice(0, 10) : "",
    validUntil: p.validUntil ? p.validUntil.slice(0, 10) : "",
  };
}

export function MasterDataTable() {
  const [side, setSide] = useState<Side>("SALES");
  const [rows, setRows] = useState<Product[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/master-data?side=${side}`);
    if (r.ok) {
      const j = (await r.json()) as { products: Product[]; canEdit: boolean };
      setRows(j.products);
      setCanEdit(j.canEdit);
    }
  }, [side]);

  useEffect(() => {
    setRows(null);
    setEditingId(null);
    setAdding(false);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !rows) return rows ?? [];
    return rows.filter((p) =>
      [p.skuId, p.name, p.sku, p.manufacturer, p.family].some((f) => f?.toLowerCase().includes(q)),
    );
  }, [rows, search]);

  function startAdd() {
    setDraft(EMPTY);
    setEditingId(null);
    setAdding(true);
  }
  function startEdit(p: Product) {
    setDraft(toDraft(p));
    setAdding(false);
    setEditingId(p.id);
  }
  function cancel() {
    setAdding(false);
    setEditingId(null);
    setDraft(EMPTY);
  }

  async function save() {
    if (!draft.name.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const payload = { ...draft, side };
      const r = adding
        ? await fetch("/api/master-data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`/api/master-data/${editingId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setMsg(j.error ?? `Error ${r.status}`);
        return;
      }
      cancel();
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: Product) {
    if (busy || !window.confirm(`Delete “${p.name}” from the catalog? This cannot be undone.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/master-data/${p.id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setMsg(j.error ?? `Error ${r.status}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const salesCount = side === "SALES" ? rows?.length : undefined;

  const fields = (
    <div className="md-form">
      <div className="md-form-grid">
        <label className="md-field md-col-2">
          <span>Product name *</span>
          <input className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Acrobat Pro DC — Enterprise" />
        </label>
        <label className="md-field">
          <span>SKU</span>
          <input className="input" value={draft.sku} onChange={(e) => setDraft({ ...draft, sku: e.target.value })} placeholder="ADB-ACRO-PRO" />
        </label>
        <label className="md-field">
          <span>{side === "SALES" ? "Manufacturer / Org" : "Vendor / Manufacturer"}</span>
          <input className="input" value={draft.manufacturer} onChange={(e) => setDraft({ ...draft, manufacturer: e.target.value })} placeholder="Adobe Inc." />
        </label>
        <label className="md-field">
          <span>Product family</span>
          <input className="input" value={draft.family} onChange={(e) => setDraft({ ...draft, family: e.target.value })} placeholder="Document Cloud" />
        </label>
        <label className="md-field">
          <span>Unit price</span>
          <input className="input" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} placeholder="199.00" inputMode="decimal" />
        </label>
        <label className="md-field">
          <span>Currency</span>
          <input className="input" value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })} placeholder="USD" maxLength={6} />
        </label>
        <label className="md-field">
          <span>Valid from</span>
          <input className="input" type="date" value={draft.validFrom} onChange={(e) => setDraft({ ...draft, validFrom: e.target.value })} />
        </label>
        <label className="md-field">
          <span>Valid until</span>
          <input className="input" type="date" value={draft.validUntil} onChange={(e) => setDraft({ ...draft, validUntil: e.target.value })} />
        </label>
        <label className="md-field md-col-2">
          <span>Pricing notes / family pricing</span>
          <input className="input" value={draft.pricingNotes} onChange={(e) => setDraft({ ...draft, pricingNotes: e.target.value })} placeholder="Volume tiers, bundle pricing, etc." />
        </label>
      </div>
      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button type="button" className="btn" disabled={busy || !draft.name.trim()} onClick={() => void save()}>
          {adding ? "Add product" : "Save changes"}
        </button>
        <button type="button" className="btn secondary" disabled={busy} onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <div className="direction-tabs" style={{ marginBottom: 16 }}>
        {(["SALES", "PROCUREMENT"] as Side[]).map((s) => (
          <button key={s} type="button" className={`direction-tab ${side === s ? "active" : ""}`} onClick={() => setSide(s)}>
            {s === "SALES" ? "Sales catalog" : "Procurement catalog"}
            {rows && side === s ? <span className="agreements-count">{rows.length}</span> : null}
          </button>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 14 }}>
        {side === "SALES"
          ? "Products your team sells. Add them here, then pick them into a sales contract from the deal's Contract tab."
          : "Products captured from signed procurement agreements. Auto-extracted on signing and fully editable — correct any extraction mistakes inline."}
      </p>

      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <input
          className="input"
          style={{ maxWidth: 340, flex: "1 1 240px" }}
          placeholder="Search by product ID, name, SKU, manufacturer, or family…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.trim() ? (
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
            {filtered.length} match{filtered.length === 1 ? "" : "es"}
            <button type="button" onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", marginLeft: 8, fontSize: 12 }}>
              clear
            </button>
          </span>
        ) : null}
        <div style={{ flex: 1 }} />
        {canEdit && !adding && !editingId ? (
          <button type="button" className="btn" onClick={startAdd}>
            + Add product
          </button>
        ) : null}
      </div>

      {msg ? <div className="card" style={{ marginBottom: 12, padding: "8px 12px", fontSize: 13 }}>{msg}</div> : null}
      {adding ? <div className="card" style={{ marginBottom: 14 }}>{fields}</div> : null}

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            {search.trim()
              ? "No products match your search."
              : side === "SALES"
                ? "No sales products yet. Add your first product to build the catalog."
                : "No procurement products yet. They appear here automatically once a procurement agreement is signed."}
          </p>
        </div>
      ) : (
        <div className="card md-table-card">
          <table className="md-table">
            <thead>
              <tr>
                <th>Product ID</th>
                <th>Product</th>
                <th>SKU</th>
                <th>{side === "SALES" ? "Manufacturer" : "Vendor"}</th>
                <th>Family</th>
                <th>Unit price</th>
                <th>Validity</th>
                <th>Source</th>
                {canEdit ? <th aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id}>
                    <td colSpan={canEdit ? 9 : 8}>{fields}</td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>{p.skuId ?? "—"}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      {p.pricingNotes ? <div className="muted" style={{ fontSize: 12 }}>{p.pricingNotes}</div> : null}
                    </td>
                    <td className="mono">{p.sku ?? "—"}</td>
                    <td>{p.manufacturer ?? "—"}</td>
                    <td>{p.family ?? "—"}</td>
                    <td>{money(p.unitPrice, p.currency)}</td>
                    <td style={{ fontSize: 12 }}>{validity(p)}</td>
                    <td style={{ fontSize: 12 }}>
                      {p.method === "AI" ? <span className="md-badge ai">AI</span> : <span className="md-badge">Manual</span>}
                      {p.sourceHref ? (
                        <Link href={p.sourceHref} className="md-source-link">
                          {p.sourceLabel}
                        </Link>
                      ) : p.sourceLabel ? (
                        <span className="muted" style={{ marginLeft: 6 }}>{p.sourceLabel}</span>
                      ) : null}
                    </td>
                    {canEdit ? (
                      <td className="md-actions">
                        <button type="button" className="btn secondary" onClick={() => startEdit(p)}>Edit</button>
                        <button type="button" className="btn secondary" onClick={() => void remove(p)}>Delete</button>
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
