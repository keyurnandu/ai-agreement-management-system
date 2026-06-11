export function VendorWorkflowGuide({ direction }: { direction?: "ORG_SELLING" | "ORG_BUYING" }) {
  const counterparty = direction === "ORG_BUYING" ? "vendor" : "customer";
  const team = direction === "ORG_BUYING" ? "Procurement" : "Sales";

  return (
    <div className="card" style={{ fontSize: 13 }}>
      <h2 style={{ marginTop: 0, fontSize: 15 }}>What {team} sends · what the {counterparty} can do</h2>
      <ol style={{ margin: "10px 0 0", paddingLeft: 20, lineHeight: 1.65 }}>
        <li>
          <strong>Send to counterparty</strong> — email with a <strong>portal link</strong> (no login; token in URL).
          They view the current PDF and linked contract clauses.
        </li>
        <li>
          <strong>{counterparty} fixes issues in the portal</strong> — edit clause text directly (no PDF upload
          required). The document regenerates automatically.
        </li>
        <li>
          <strong>Change review</strong> — text diff highlights additions and removals between versions (visible on this
          deal for {team.toLowerCase()} and in the portal for the {counterparty}).
        </li>
        <li>
          <strong>Compliance check</strong> — run against your rule pack; reviewers can <strong>raise issues</strong>{" "}
          (severity, description).
        </li>
        <li>
          <strong>{team} can also edit</strong> on the <strong>Contract</strong> tab and regenerate — the {counterparty}{" "}
          sees the same highlighted diff in their portal.
        </li>
        <li>
          <strong>{team} approves</strong> when all issues are resolved — only then use <strong>Start signing</strong>.
        </li>
        <li>
          <strong>E-sign</strong> — agreement is sent to signers; status moves to Signing → Completed.
        </li>
      </ol>
      <p className="muted" style={{ fontSize: 12, marginBottom: 0, marginTop: 12 }}>
        PDF upload in the portal is optional (external counsel redlines). Prefer in-app clause editing when a contract is
        linked to this deal.
      </p>
    </div>
  );
}
