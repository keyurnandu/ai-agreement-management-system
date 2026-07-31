/**
 * Adobe compliance rule packs.
 *
 * Rules are STRUCTURED so the engine evaluates them deterministically
 * (see apps/web/src/lib/compliance-rules.ts):
 *   - requireAny: at least one phrase must appear in the document, else MISSING
 *   - forbidAny:  none of these phrases may appear, else DEVIATES
 * The same rules render a human-readable checklist PDF in Settings → Compliance.
 */

export const SALES_RULES = [
  {
    id: "liability-cap",
    title: "Liability cap present",
    severity: "HIGH",
    requireAny: ["limitation of liability", "liability cap", "liability shall not exceed", "aggregate liability", "liability is capped"],
    guidance: "Adobe customer contracts must cap liability (standard: 12 months of fees). Add a Limitation of Liability clause.",
  },
  {
    id: "governing-law-ca",
    title: "Governing law is California",
    severity: "MEDIUM",
    requireAny: ["state of california", "laws of california", "california law", "laws of the state of california"],
    guidance: "Adobe's standard governing law is the State of California. Update the Governing Law clause.",
  },
  {
    id: "data-privacy",
    title: "Data protection & privacy terms",
    severity: "HIGH",
    requireAny: ["data protection", "data privacy", "personal data", "gdpr", "ccpa", "data processing"],
    guidance: "Include data-protection terms (GDPR/CCPA) covering how customer data is handled, secured, and deleted.",
  },
  {
    id: "confidentiality",
    title: "Confidentiality clause",
    severity: "MEDIUM",
    requireAny: ["confidential", "confidentiality", "non-disclosure", "nondisclosure"],
    guidance: "A mutual confidentiality clause is required.",
  },
  {
    id: "payment-terms",
    title: "Payment terms defined",
    severity: "MEDIUM",
    requireAny: ["net 30", "net-30", "net thirty", "payment terms", "days from the date", "payable within"],
    guidance: "State clear payment terms (Adobe standard: Net 30).",
  },
  {
    id: "no-unlimited-liability",
    title: "No unlimited liability",
    severity: "HIGH",
    forbidAny: ["unlimited liability", "liability shall be unlimited", "without any limitation of liability"],
    guidance: "Unlimited liability is not permitted. Replace with a capped liability clause.",
  },
  {
    id: "term-renewal",
    title: "Term & renewal defined",
    severity: "LOW",
    requireAny: ["initial term", "term of this agreement", "renewal", "auto-renew", "months from"],
    guidance: "Specify the contract term and renewal mechanics.",
  },
];

export const PROCUREMENT_RULES = [
  {
    id: "vendor-liability-cap",
    title: "Vendor liability cap",
    severity: "HIGH",
    requireAny: ["limitation of liability", "liability cap", "aggregate liability", "liability shall not exceed"],
    guidance: "Vendor must accept a liability cap of at least 12 months of fees (or $500k minimum). Escalate missing or vendor-favorable caps.",
  },
  {
    id: "security-certification",
    title: "Security certification (SOC 2 / ISO 27001)",
    severity: "HIGH",
    requireAny: ["soc 2", "soc2", "iso 27001", "iso/iec 27001", "security controls", "encryption at rest"],
    guidance: "Vendor must evidence SOC 2 Type II or ISO 27001. Add a Security & Compliance clause.",
  },
  {
    id: "data-processing",
    title: "Data processing addendum (GDPR)",
    severity: "HIGH",
    requireAny: ["data processing addendum", "data processing agreement", "gdpr", "sub-processor", "subprocessor", "personal data"],
    guidance: "A Data Processing Addendum is required wherever personal data is processed.",
  },
  {
    id: "termination-convenience",
    title: "Termination for convenience",
    severity: "MEDIUM",
    requireAny: ["termination for convenience", "terminate for convenience", "terminate without cause", "for convenience upon"],
    guidance: "Adobe requires the right to terminate for convenience on 30 days' notice or less.",
  },
  {
    id: "insurance",
    title: "Insurance requirements",
    severity: "MEDIUM",
    requireAny: ["insurance", "commercial general liability", "cyber liability", "professional liability"],
    guidance: "Vendor must carry adequate insurance (commercial general liability + cyber).",
  },
  {
    id: "no-auto-renewal",
    title: "No auto-renewal / evergreen term",
    severity: "MEDIUM",
    forbidAny: ["automatically renew", "auto-renew", "automatic renewal", "evergreen"],
    guidance: "Auto-renewal / evergreen terms are not permitted. Require an affirmative renewal with 30-day notice or less.",
  },
  {
    id: "audit-rights",
    title: "Audit rights",
    severity: "LOW",
    requireAny: ["right to audit", "audit right", "audit"],
    guidance: "Include annual audit rights on reasonable notice.",
  },
];

const SEV_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** Render structured rules into a readable checklist (for the compliance PDF). */
function linesFromRules(header, subtitle, rules) {
  const lines = [header, subtitle, ""];
  const sorted = [...rules].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  sorted.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title}  [${r.severity}]`);
    lines.push(`   ${r.guidance}`);
    if (r.requireAny?.length) lines.push(`   Looks for: ${r.requireAny.slice(0, 4).join("; ")}`);
    if (r.forbidAny?.length) lines.push(`   Must not contain: ${r.forbidAny.join("; ")}`);
    lines.push("");
  });
  return lines;
}

export const SALES_CHECKS_TITLE = "Adobe compliance checks — Sales";
export const SALES_CHECKS_LINES = linesFromRules(
  "Adobe Inc. — Standard customer contract review checklist",
  "Runs automatically on Deals → Sales → Run compliance check",
  SALES_RULES,
);
/** Engine-consumed rule pack (structured JSON). */
export const SALES_CHECKS_TEXT = JSON.stringify({ version: 1, rules: SALES_RULES }, null, 2);

export const PROCUREMENT_CHECKS_TITLE = "Adobe compliance checks — Procurement";
export const PROCUREMENT_CHECKS_LINES = linesFromRules(
  "Adobe Inc. — Standard vendor contract review checklist",
  "Runs automatically on Deals → Procurement → Run compliance check",
  PROCUREMENT_RULES,
);
export const PROCUREMENT_CHECKS_TEXT = JSON.stringify({ version: 1, rules: PROCUREMENT_RULES }, null, 2);
