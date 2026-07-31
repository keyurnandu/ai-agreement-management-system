"use client";

import { useCallback, useEffect, useState } from "react";
import type { AttributeSource } from "@/lib/attribute-source";
import { toCsv } from "@/lib/attribute-source";
import { buildAttributeExportCsv, type ExportFormat } from "@/lib/attribute-table-export";
import { useAttributeHighlight } from "@/components/AttributeHighlightContext";
import { loadVisibleAttributeKeys, saveHiddenAttributeKeys } from "@/lib/attribute-visibility";
import Link from "next/link";

type Attr = {
  key: string;
  label: string;
  type: string;
  prompt: string;
  value: string | null;
  confidence: number | null;
  method: string | null;
  source: AttributeSource | null;
};

export function AttributesPanel({
  documentId,
  documentTitle,
  canEdit,
}: {
  documentId: string;
  documentTitle: string;
  canEdit: boolean;
}) {
  const { highlight, setHighlight } = useAttributeHighlight();
  const [attrs, setAttrs] = useState<Attr[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [extractingKey, setExtractingKey] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("table_rows");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const r = await fetch(`/api/documents/${documentId}/attributes`);
    if (r.ok) {
      const list = ((await r.json()) as { attributes: Attr[] }).attributes;
      setAttrs(list);
      setSelected(new Set(list.map((a) => a.key)));
      setVisibleKeys(loadVisibleAttributeKeys(documentId, list.map((a) => a.key)));
    }
  }, [documentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(keys?: string[]) {
    const isAll = !keys?.length;
    if (isAll) setBusy(true);
    else setExtractingKey(keys[0] ?? null);
    try {
      await fetch(`/api/documents/${documentId}/extract`, {
        method: "POST",
        headers: keys?.length ? { "content-type": "application/json" } : undefined,
        body: keys?.length ? JSON.stringify({ keys }) : undefined,
      });
      await load();
    } finally {
      setBusy(false);
      setExtractingKey(null);
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

  // "View source": highlight directly on the rendered PDF. If the stored source
  // has no bounding box (older/manual extractions), locate it on the page now so
  // the highlight lands on the contract instead of the extracted-text view.
  async function viewSource(a: Attr) {
    const src = a.source;
    if (!src) return;
    if (!src.rect && !src.formField) {
      try {
        const r = await fetch(`/api/documents/${documentId}/locate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: a.value ?? src.snippet, page: src.page }),
        });
        if (r.ok) {
          const j = (await r.json()) as { page?: number; rect?: { x: number; y: number; w: number; h: number } | null };
          if (j.rect) {
            setHighlight({ key: a.key, ...src, page: j.page ?? src.page, rect: j.rect });
            return;
          }
        }
      } catch {
        /* fall through to the text-view highlight */
      }
    }
    setHighlight({ key: a.key, ...src });
  }

  function toggleVisibleKey(key: string) {
    if (!attrs) return;
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveHiddenAttributeKeys(
        documentId,
        attrs.map((a) => a.key),
        next,
      );
      return next;
    });
  }

  const displayed = attrs?.filter((a) => visibleKeys.has(a.key)) ?? [];

  function toggleExportKey(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function downloadCsv() {
    if (!attrs) return;
    const picked = attrs.filter((a) => selected.has(a.key));
    const { csv, filenameSuffix } = buildAttributeExportCsv(picked, exportFormat, toCsv);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${documentTitle.replace(/[^\w.-]+/g, "_")}_${filenameSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
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
    <div className="card doc-panel">
      <div className="row">
        <h2 style={{ margin: 0 }}>Attributes</h2>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {attrs.length > 0 ? (
            <>
              <button
                type="button"
                className="btn secondary"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => {
                  setCustomizeOpen((v) => !v);
                  setExportOpen(false);
                }}
              >
                Show / hide
              </button>
              <button
                type="button"
                className="btn secondary"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => {
                  setExportOpen((v) => !v);
                  setCustomizeOpen(false);
                }}
              >
                Export CSV
              </button>
            </>
          ) : null}
          {canEdit ? (
            <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy || !!extractingKey} onClick={() => run()}>
              {busy ? "Extracting…" : "Run all"}
            </button>
          ) : null}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>
        {displayed.length} of {attrs.length} shown · Extracted values appear here — use <strong>Export CSV</strong> for
        line items (products &amp; services). <strong>View source</strong> highlights on the PDF when located.{" "}
        <Link href="/settings/attributes" style={{ fontSize: 12 }}>
          Define attributes
        </Link>
      </p>

      {customizeOpen ? (
        <div className="panel-inset" style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Choose which attributes appear on this document (saved in your browser)
          </div>
          <div className="grid" style={{ gap: 6, maxHeight: 200, overflowY: "auto" }}>
            {attrs.map((a) => (
              <label key={a.key} className="row" style={{ justifyContent: "flex-start", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={visibleKeys.has(a.key)} onChange={() => toggleVisibleKey(a.key)} />
                {a.label}
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: "flex-start", gap: 8 }}>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => {
                if (!attrs) return;
                const all = new Set(attrs.map((a) => a.key));
                setVisibleKeys(all);
                saveHiddenAttributeKeys(documentId, attrs.map((a) => a.key), all);
              }}
            >
              Show all
            </button>
          </div>
        </div>
      ) : null}

      {exportOpen ? (
        <div className="panel-inset" style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            Select attributes to export
          </div>
          <div style={{ marginBottom: 10 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
              CSV format
            </div>
            <label style={{ display: "flex", gap: 8, fontSize: 13, marginBottom: 4, cursor: "pointer" }}>
              <input
                type="radio"
                name="export-format"
                checked={exportFormat === "table_rows"}
                onChange={() => setExportFormat("table_rows")}
              />
              Table rows — one row per line item (TABLE / JSON / markdown)
            </label>
            <label style={{ display: "flex", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input
                type="radio"
                name="export-format"
                checked={exportFormat === "summary"}
                onChange={() => setExportFormat("summary")}
              />
              Summary — one row per attribute (value in a single cell)
            </label>
          </div>
          <div className="grid" style={{ gap: 6, maxHeight: 160, overflowY: "auto" }}>
            {attrs.map((a) => (
              <label key={a.key} className="row" style={{ justifyContent: "flex-start", fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={selected.has(a.key)} onChange={() => toggleExportKey(a.key)} />
                {a.label}
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: "flex-start", gap: 8 }}>
            <button
              className="btn secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => setSelected(new Set(attrs.map((a) => a.key)))}
            >
              All
            </button>
            <button className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setSelected(new Set())}>
              None
            </button>
            <button className="btn" style={{ padding: "4px 10px", fontSize: 12 }} disabled={selected.size === 0} onClick={downloadCsv}>
              Download ({selected.size})
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid" style={{ gap: 10, marginTop: 12 }}>
        {attrs.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            No attributes yet.{" "}
            <Link href="/settings/attributes">Create attribute definitions in Settings</Link> then run extraction here.
          </p>
        ) : null}
        {displayed.length === 0 && attrs.length > 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            All attributes hidden. Use <strong>Show / hide</strong> to pick what to display.
          </p>
        ) : null}
        {displayed.map((a) => {
          const isActive = highlight?.key === a.key;
          const isExtracting = extractingKey === a.key;
          return (
            <div
              key={a.key}
              style={{
                padding: 8,
                borderRadius: 8,
                border: isActive ? "1px solid rgba(251,191,36,0.45)" : "1px solid transparent",
                background: isActive ? "rgba(251,191,36,0.06)" : undefined,
              }}
            >
              <div className="row" style={{ alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{a.label}</div>
                  {a.value && (a.value.includes("\n") || a.value.includes("|")) ? (
                    <pre
                      style={{
                        fontSize: 11,
                        whiteSpace: "pre-wrap",
                        margin: "4px 0 0",
                        padding: 8,
                        borderRadius: 6,
                        background: "var(--panel-2)",
                        border: "1px solid var(--border)",
                        maxHeight: 360,
                        overflow: "auto",
                      }}
                    >
                      {a.value}
                    </pre>
                  ) : (
                    <div style={{ fontSize: 13, color: a.value ? "var(--text)" : "var(--muted)" }}>{a.value ?? "—"}</div>
                  )}
                  <div className="muted" style={{ fontSize: 10 }}>
                    {a.method ? a.method.toLowerCase() : "not extracted"}
                    {a.confidence != null ? ` · ${(a.confidence * 100).toFixed(0)}%` : ""}
                  </div>
                  {a.key === "products_services" && a.value ? (
                    <p className="muted" style={{ fontSize: 10, margin: "4px 0 0" }}>
                      Line items — export via CSV (Table rows format). Re-run extraction if source won&apos;t locate.
                    </p>
                  ) : null}
                  {a.source ? (
                    <button
                      type="button"
                      className="source-link"
                      title={a.source.snippet}
                      onClick={() => void viewSource(a)}
                    >
                      <span className="pill" style={{ marginTop: 6, fontSize: 11, color: "var(--amber)" }}>
                        p{a.source.page} · {a.source.formField ? "view form field" : "view on PDF"}
                      </span>
                    </button>
                  ) : a.value && a.value !== "N/A" ? (
                    <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                      source not located — re-run extraction
                    </div>
                  ) : null}
                </div>
                {canEdit ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button
                      className="btn secondary"
                      style={{ padding: "2px 8px", fontSize: 11 }}
                      disabled={busy || isExtracting}
                      title="Re-extract this attribute only"
                      onClick={() => run([a.key])}
                    >
                      {isExtracting ? "…" : "↻"}
                    </button>
                    <button className="btn secondary" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => edit(a)}>
                      set
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
