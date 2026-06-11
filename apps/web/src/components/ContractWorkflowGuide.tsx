export function ContractWorkflowGuide({ direction }: { direction?: "ORG_SELLING" | "ORG_BUYING" }) {
  const isProc = direction === "ORG_BUYING";
  const team = isProc ? "Procurement" : "Sales";
  const master = isProc ? "CPMCW" : "CSMCW";
  const wrapper = isProc ? "CPCW" : "CSCW";
  const order = isProc ? "CPOR" : "CSOR";
  const amend = isProc ? "CPAM" : "CSAM";

  return (
    <div className="card" style={{ fontSize: 13 }}>
      <h2 style={{ marginTop: 0, fontSize: 15 }}>{team} clause library — how this fits the cycle</h2>
      <ol style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.65 }}>
        <li>
          <strong>Author here</strong> — pick {master}, {wrapper}, {order}, or {amend}. Parent link is optional (tail
          spend orders can stand alone).
        </li>
        <li>
          <strong>Generate PDF</strong> from the contract editor — pushes a document version linked to this record.
        </li>
        <li>
          <strong>Link to a Deal</strong> with the same commercial ID — that is where negotiation, vendor portal,
          compliance, and signing happen.
        </li>
        <li>
          Deals drive the live cycle; contracts hold the canonical clause text both sides can edit.
        </li>
      </ol>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 12 }}>
        Big-org pattern: {master} framework → {wrapper} per program → many {order} POs. Amendments ({amend}) attach to
        master or wrapper.
      </p>
    </div>
  );
}
