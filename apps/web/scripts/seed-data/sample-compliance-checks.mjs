/** Source text for demo compliance rule-pack PDFs (Settings → Compliance rules). */

export const SALES_CHECKS_TITLE = "Sample compliance checks — Sales";

export const SALES_CHECKS_LINES = [
  "Demo Corp Inc. — Standard customer contract review checklist",
  "Use with Deals → Sales → Run compliance check",
  "",
  "1. LIABILITY",
  "   Customer liability cap must not exceed fees paid in the prior twelve (12) months.",
  "   Uncapped liability for gross negligence or willful misconduct is acceptable.",
  "",
  "2. SERVICE LEVELS",
  "   Production API uptime commitment: minimum 99.9% monthly.",
  "   Support: P1 response within 1 hour; P2 within 4 business hours.",
  "",
  "3. DATA & PRIVACY",
  "   Customer data deleted within 30 days of termination.",
  "   Sub-processors listed and customer notified of material changes.",
  "",
  "4. RENEWAL & PRICING",
  "   Auto-renewal requires at least 60 days written non-renewal notice.",
  "   Renewal price increases capped at 5% annually unless order form states otherwise.",
  "",
  "5. ACCEPTABLE USE",
  "   Customer may not reverse engineer, resell, or use service for unlawful purposes.",
  "",
  "6. EXPORT & GOVERNING LAW",
  "   Customer warrants US export compliance.",
  "   Governing law: State of Delaware unless master agreement specifies otherwise.",
];

export const SALES_CHECKS_TEXT = SALES_CHECKS_LINES.join("\n");

export const PROCUREMENT_CHECKS_TITLE = "Sample compliance checks — Procurement";

export const PROCUREMENT_CHECKS_LINES = [
  "Demo Corp Inc. — Standard vendor contract review checklist",
  "Use with Deals → Procurement → Run compliance check",
  "",
  "1. LIABILITY",
  "   Vendor liability cap must not exceed fees paid in the twelve months before the claim.",
  "   Carve-outs required for IP infringement, confidentiality breach, and data breach.",
  "",
  "2. SECURITY & COMPLIANCE",
  "   Vendor must maintain SOC 2 Type II or equivalent certification.",
  "   GDPR and CCPA compliance required where personal data is processed.",
  "",
  "3. PAYMENT & AUDIT",
  "   Payment terms: net 60 days unless strategic vendor exception documented.",
  "   Customer audit rights: once per year on reasonable notice.",
  "",
  "4. TERMINATION",
  "   Termination for convenience: maximum 90 days written notice.",
  "   Confidentiality survives termination for at least five (5) years.",
  "",
  "5. INSURANCE",
  "   Commercial general liability minimum $2M per occurrence.",
  "",
  "6. GOVERNING LAW",
  "   State of Delaware preferred; document exceptions in negotiation issues.",
];

export const PROCUREMENT_CHECKS_TEXT = PROCUREMENT_CHECKS_LINES.join("\n");
