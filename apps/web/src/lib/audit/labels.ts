type Meta = Record<string, unknown> | null | undefined;

const LABELS: Record<string, string> = {
  "deal.create": "Deal created",
  "deal.delete": "Deal deleted",
  "deal.send_vendor": "Sent to counterparty",
  "deal.vendor_clause_edit": "Counterparty edited clause",
  "deal.vendor_upload": "Counterparty uploaded PDF",
  "deal.compliance_check": "Compliance check run",
  "deal.approve": "Document approved",
  "deal.start_signing": "Signing started",
  "deal.publish_contract_pdf": "Contract published to PDF",
  "deal.issue.create": "Issue raised",
  "deal.issue.vendor_response": "Counterparty responded to issue",
  "contract.clause.update": "Clause updated",
  "contract.generate": "Contract PDF generated",
  "contract.delete": "Contract deleted",
  "document.upload": "Document uploaded",
  "agreement.completed": "Agreement completed",
  "recipient.sign": "Recipient signed",
};

export function auditActionLabel(action: string): string {
  return LABELS[action] ?? action.replace(/\./g, " · ");
}

/** Keep activity-log lines short — old AI/PDF diffs stored huge markdown blobs. */
function compactDiffSummary(summary: string, action: string, metadata: Meta): string {
  const s = summary.trim();
  const version = typeof metadata?.version === "number" ? metadata.version : null;

  if (s.startsWith("Updated clause ") && !s.includes("**") && s.length <= 140) return s;

  const noisy =
    s.includes("**") ||
    s.includes("\n\n") ||
    s.length > 140 ||
    /\d+ line\(s\) added/i.test(s);

  if (noisy) {
    if (version !== null) return `Document version ${version}`;
    if (action === "deal.vendor_clause_edit") return "Clause text updated";
    if (action === "deal.vendor_upload") return "PDF revision uploaded";
    return "Document updated";
  }

  if (s.length > 140) return `${s.slice(0, 137)}…`;
  return s;
}

export function auditEventDetail(action: string, metadata: Meta): string | null {
  if (!metadata) return null;
  if (typeof metadata.diffSummary === "string") {
    return compactDiffSummary(metadata.diffSummary, action, metadata);
  }
  if (typeof metadata.version === "number") return `Document version ${metadata.version}`;
  if (typeof metadata.signedVersion === "number") return `Signed version ${metadata.signedVersion}`;
  if (typeof metadata.vendorEmail === "string" && action === "deal.send_vendor") {
    return `Invited ${metadata.vendorEmail}`;
  }
  if (typeof metadata.title === "string") return metadata.title as string;
  if (typeof metadata.filename === "string") return metadata.filename as string;
  if (typeof metadata.issueCount === "number") return `${metadata.issueCount} issue(s) found`;
  if (typeof metadata.issues === "number") return `${metadata.issues} issue(s) found`;
  return null;
}
