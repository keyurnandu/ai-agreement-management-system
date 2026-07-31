"use client";

import Link from "next/link";
import { useState } from "react";
import { AttributesPanel } from "@/components/AttributesPanel";
import { AttributeHighlightProvider } from "@/components/AttributeHighlightContext";

type Row = {
  agreementId: string;
  agreementTitle: string;
  agreementStatus: string;
  documentId: string;
  documentTitle: string;
  dealId?: string | null;
};

/** Extract products from a signed procurement agreement into the master-data
 * catalog. Enabled only once the agreement is COMPLETED (fully signed). */
function ProductExtractButton({ dealId, completed }: { dealId: string | null | undefined; completed: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    if (!dealId || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/deals/${dealId}/import-products`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replace: true }),
      });
      const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
      setMsg(j.message ?? j.error ?? (r.ok ? "Done." : `Error ${r.status}`));
    } catch {
      setMsg("Extraction failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!completed) {
    return (
      <span className="muted" style={{ fontSize: 12 }} title="Product extraction runs once the agreement is fully signed">
        Products extract after signing
      </span>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button type="button" className="btn secondary" style={{ fontSize: 12, padding: "4px 10px" }} disabled={busy || !dealId} onClick={() => void run()}>
        {busy ? "Extracting…" : "Extract products → catalog"}
      </button>
      {msg ? <span className="muted" style={{ fontSize: 12 }}>{msg} <Link href="/master-data">View catalog →</Link></span> : null}
    </div>
  );
}

export function AgreementExtractionSection({
  rows,
  canEdit,
  productExtraction,
}: {
  rows: Row[];
  canEdit: boolean;
  productExtraction?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="card" style={{ marginTop: 20 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Attribute extraction</h2>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Signed documents from deals in this cycle appear here for AI extraction (products &amp; services, dates,
          totals, etc.).
        </p>
      </div>
    );
  }

  return (
    <AttributeHighlightProvider>
      <div style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Attribute extraction</h2>
        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          Run extraction on agreement PDFs — export line items as CSV from each panel.
        </p>
        <div className="grid" style={{ gap: 16 }}>
          {rows.map((r) => (
            <div key={r.agreementId} className="card">
              <div className="row" style={{ marginBottom: 8, alignItems: "flex-start" }}>
                <div>
                  <Link href={`/agreements/${r.agreementId}`} style={{ fontWeight: 600, fontSize: 14 }}>
                    {r.agreementTitle}
                  </Link>
                  <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                    {r.agreementStatus} · {r.documentTitle}
                  </p>
                </div>
                <Link href={`/documents/${r.documentId}`} className="btn secondary" style={{ fontSize: 12, padding: "4px 10px" }}>
                  Open PDF
                </Link>
              </div>
              {productExtraction && canEdit ? (
                <div style={{ margin: "0 0 12px" }}>
                  <ProductExtractButton dealId={r.dealId} completed={r.agreementStatus === "COMPLETED"} />
                </div>
              ) : null}
              <AttributesPanel documentId={r.documentId} documentTitle={r.documentTitle} canEdit={canEdit} />
            </div>
          ))}
        </div>
      </div>
    </AttributeHighlightProvider>
  );
}
