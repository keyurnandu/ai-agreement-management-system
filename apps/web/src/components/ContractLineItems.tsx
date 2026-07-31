"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type LineItem = {
  productId?: string;
  sku?: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice?: number | null;
  currency?: string;
};
type CatalogProduct = {
  id: string;
  name: string;
  sku: string | null;
  manufacturer: string | null;
  family: string | null;
  unitPrice: number | null;
  currency: string;
  pricingNotes: string | null;
};

function money(v: number | null | undefined, currency = "USD") {
  if (v === null || v === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

/** Sales product picker + line-item editor for a contract. Selected products are
 * stored on the contract and rendered into the generated PDF as "Products & Pricing". */
export function ContractLineItems({ contractId }: { contractId: string }) {
  const [items, setItems] = useState<LineItem[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [catalog, setCatalog] = useState<CatalogProduct[] | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/contracts/${contractId}/line-items`);
    if (r.ok) {
      const j = (await r.json()) as { items: LineItem[]; canEdit: boolean };
      setItems(j.items);
      setCanEdit(j.canEdit);
      setDirty(false);
    }
  }, [contractId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openPicker() {
    setShowPicker(true);
    if (catalog === null) {
      const r = await fetch(`/api/master-data?side=SALES`);
      if (r.ok) setCatalog(((await r.json()) as { products: CatalogProduct[] }).products);
    }
  }

  function addProduct(p: CatalogProduct) {
    setItems((cur) => [
      ...(cur ?? []),
      {
        productId: p.id,
        sku: p.sku ?? undefined,
        name: p.name,
        description: p.pricingNotes ?? undefined,
        quantity: 1,
        unitPrice: p.unitPrice,
        currency: p.currency,
      },
    ]);
    setDirty(true);
    setMsg(null);
  }
  function setQty(idx: number, qty: number) {
    setItems((cur) => (cur ?? []).map((it, i) => (i === idx ? { ...it, quantity: qty > 0 ? qty : 1 } : it)));
    setDirty(true);
  }
  function remove(idx: number) {
    setItems((cur) => (cur ?? []).filter((_, i) => i !== idx));
    setDirty(true);
  }

  async function save() {
    if (busy || !items) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/contracts/${contractId}/line-items`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setMsg(j.error ?? `Error ${r.status}`);
        return;
      }
      setDirty(false);
      setMsg("Saved. Click “Generate PDF” above to include them in the document.");
    } finally {
      setBusy(false);
    }
  }

  const { total, currency } = useMemo(() => {
    const list = items ?? [];
    const cur = list.find((i) => i.currency)?.currency ?? "USD";
    const t = list.reduce((s, i) => s + (i.unitPrice ?? 0) * (i.quantity || 1), 0);
    return { total: t, currency: cur };
  }, [items]);

  const catalogFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!catalog) return [];
    if (!q) return catalog;
    return catalog.filter((p) => [p.name, p.sku, p.manufacturer, p.family].some((f) => f?.toLowerCase().includes(q)));
  }, [catalog, search]);

  if (!items) return null;

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="row" style={{ marginBottom: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>Products &amp; Pricing</h2>
        {canEdit ? (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: "4px 10px" }} disabled={busy} onClick={() => void openPicker()}>
              + Add from catalog
            </button>
            {dirty ? (
              <button type="button" className="btn" style={{ fontSize: 12, padding: "4px 10px" }} disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          No products on this contract yet.{" "}
          {canEdit ? (
            <>Pick from the <Link href="/master-data">sales catalog</Link> to add line items.</>
          ) : null}
        </p>
      ) : (
        <table className="md-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th style={{ width: 70 }}>Qty</th>
              <th>Unit price</th>
              <th>Extended</th>
              {canEdit ? <th aria-label="Actions" /> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const ext = it.unitPrice != null ? it.unitPrice * (it.quantity || 1) : null;
              return (
                <tr key={idx}>
                  <td className="mono">{it.sku ?? "—"}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{it.name}</div>
                    {it.description ? <div className="muted" style={{ fontSize: 12 }}>{it.description}</div> : null}
                  </td>
                  <td>
                    {canEdit ? (
                      <input
                        className="input"
                        style={{ width: 60, padding: "4px 6px" }}
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) => setQty(idx, Number(e.target.value))}
                      />
                    ) : (
                      it.quantity
                    )}
                  </td>
                  <td>{money(it.unitPrice, it.currency)}</td>
                  <td>{money(ext, it.currency)}</td>
                  {canEdit ? (
                    <td className="md-actions">
                      <button type="button" className="btn secondary" onClick={() => remove(idx)}>
                        Remove
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
            <tr>
              <td colSpan={4} style={{ textAlign: "right", fontWeight: 700 }}>Total</td>
              <td style={{ fontWeight: 700 }}>{money(total, currency)}</td>
              {canEdit ? <td /> : null}
            </tr>
          </tbody>
        </table>
      )}

      {msg ? <p style={{ fontSize: 12, margin: "8px 0 0", color: "var(--green)" }}>{msg}</p> : null}

      {showPicker ? (
        <div className="chat-overlay" onClick={() => setShowPicker(false)} aria-hidden="true">
          <div className="md-picker card" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add product from catalog">
            <div className="row" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Add from sales catalog</h3>
              <button type="button" className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => setShowPicker(false)}>
                Done
              </button>
            </div>
            <input
              className="input"
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 10 }}
            />
            {catalog === null ? (
              <p className="muted" style={{ fontSize: 13 }}>Loading catalog…</p>
            ) : catalogFiltered.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                No matching products. <Link href="/master-data">Add products →</Link>
              </p>
            ) : (
              <div className="md-picker-list">
                {catalogFiltered.map((p) => (
                  <button key={p.id} type="button" className="md-picker-row" onClick={() => addProduct(p)}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {[p.sku, p.family, p.manufacturer].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                      <span style={{ fontSize: 13 }}>{money(p.unitPrice, p.currency)}</span>
                      <span className="md-badge ai" style={{ background: "var(--accent-soft)" }}>Add +</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
