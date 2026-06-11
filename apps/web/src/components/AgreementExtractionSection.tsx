"use client";

import Link from "next/link";
import { AttributesPanel } from "@/components/AttributesPanel";
import { AttributeHighlightProvider } from "@/components/AttributeHighlightContext";

type Row = {
  agreementId: string;
  agreementTitle: string;
  agreementStatus: string;
  documentId: string;
  documentTitle: string;
};

export function AgreementExtractionSection({
  rows,
  canEdit,
}: {
  rows: Row[];
  canEdit: boolean;
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
              <AttributesPanel documentId={r.documentId} documentTitle={r.documentTitle} canEdit={canEdit} />
            </div>
          ))}
        </div>
      </div>
    </AttributeHighlightProvider>
  );
}
