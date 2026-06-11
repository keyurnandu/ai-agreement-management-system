export function WorkflowGuide() {
  return (
    <div className="card" style={{ fontSize: 13 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Two cycles — what to use when</h2>
      <div className="grid grid-2" style={{ gap: 14 }}>
        <section>
          <strong>Sales</strong> (org selling to customers)
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
            <li>
              <strong>Deals</strong> — SMCW → SCW → SOR with customer portal
            </li>
            <li>
              <strong>Contracts</strong> — CSMCW / CSCW / CSOR clause library
            </li>
            <li>Approve on deal → Start signing → Agreements</li>
          </ul>
        </section>
        <section>
          <strong>Procurement</strong> (org buying from vendors)
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
            <li>
              <strong>Deals</strong> — PMCW → PCW → POR; tail spend = standalone POR
            </li>
            <li>
              <strong>Contracts</strong> — CPMCW / CPCW / CPOR clause library
            </li>
            <li>Vendor upload, compliance, approve, sign</li>
          </ul>
        </section>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 14 }}>
        <strong>Documents</strong> = PDF library (view, attributes, Ask AI). Signing always starts from an approved{" "}
        <strong>Deal</strong>, not from Documents alone.
      </p>
    </div>
  );
}
