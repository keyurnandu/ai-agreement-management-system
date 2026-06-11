/**
 * Demo scenarios for sales & procurement walkthroughs.
 * Re-run `npm run db:seed` to upsert — portal tokens stay stable.
 */

export const DEMO_BASE_URL = process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

/** Stable vendor portal tokens (unique per deal). */
export const PORTAL = {
  smcw1: "demo-flow-smwc1",
  scw1: "demo-flow-scw1",
  sor1: "demo-flow-sor1",
  sor2: "demo-flow-sor2",
  sam1: "demo-flow-sam1",
  pmcw1: "demo-flow-pmcw1",
  pcw1: "demo-flow-pcw1",
  por1: "demo-flow-por1",
  por2: "demo-flow-por2-vendor-paper",
  por3: "demo-flow-por3-submitted",
  por4: "demo-flow-por4-issues",
};

export const SALES_TABLE_PRIMARY = `| SKU | Product | Qty | Unit Price |
| --- | --- | --- | --- |
| ENT-CLAUDE | Claude Enterprise — 500 seats | 500 | $60/seat/mo |
| ADD-CSM | Dedicated customer success manager | 1 | Included |`;

export const SALES_TABLE_EXPANSION = `| SKU | Product | Qty | Unit Price |
| --- | --- | --- | --- |
| ENT-CLAUDE | Claude Enterprise — 750 seats | 750 | $54/seat/mo |
| ADD-CSM | Dedicated customer success manager | 1 | Included |`;

export const PROC_TABLE_PRIMARY = `| SKU | Product | Commitment |
| --- | --- | --- |
| API-TOKENS | Claude API — token bundle | 50M tokens/month |
| API-SUPPORT | Premium API support | Business hours |`;

export const PROC_TABLE_TAIL = `| SKU | Product | Commitment |
| --- | --- | --- |
| SAAS-TOOL | Design collaboration SaaS | 25 seats / 12 months |`;

export const DEMO_GUIDE = [
  {
    flow: "Sales — master agreement (own paper / clause library)",
    deal: "SMCW-1",
    status: "UNDER_REVIEW",
    path: "/deals (Sales) → SMCW-1",
    try: "Contract tab → edit clauses → Regenerate PDF → Run compliance check",
  },
  {
    flow: "Sales — order form with product table (draft, ready to send)",
    deal: "SOR-1",
    status: "DRAFT",
    path: "/deals (Sales) → SOR-1",
    try: "Contract tab → Services clause shows markdown table → Send to counterparty",
  },
  {
    flow: "Sales — order sent to customer (portal open)",
    deal: "SOR-2",
    status: "WITH_VENDOR",
    portal: PORTAL.sor2,
    try: "Copy portal URL from deal → customer uploads revised PDF or views clauses",
  },
  {
    flow: "Sales — amendment under master",
    deal: "SAM-1",
    status: "DRAFT",
    path: "/deals (Sales) → SAM-1",
    try: "Contract tab → Amended provisions clause → Generate PDF",
  },
  {
    flow: "Procurement — master vendor agreement (own paper)",
    deal: "PMCW-1",
    status: "DRAFT",
    path: "/deals (Procurement) → PMCW-1",
    try: "Contract tab → clause library authoring → Regenerate PDF",
  },
  {
    flow: "Procurement — PO with line-item table (under master)",
    deal: "POR-1",
    status: "DRAFT",
    path: "/deals (Procurement) → POR-1",
    try: "Order form table in contract → Send to vendor",
  },
  {
    flow: "Procurement — vendor paper (no create contract; upload only)",
    deal: "POR-2",
    status: "WITH_VENDOR",
    portal: PORTAL.por2,
    try: "No contract link panel → Send → vendor portal → Upload PDF (skip Create contract)",
  },
  {
    flow: "Procurement — vendor submitted for org review",
    deal: "POR-3",
    status: "VENDOR_SUBMITTED",
    portal: PORTAL.por3,
    try: "Run compliance check → Review revision changes → Approve or add issues",
  },
  {
    flow: "Settings — sample compliance checks (sales + procurement PDFs)",
    deal: "—",
    status: "—",
    path: "/settings/compliance",
    try: "Review rule packs · open linked PDF · Run compliance on SMCW-1 or POR-3",
  },
  {
    flow: "Settings — sample sales deal template (order form shell)",
    deal: "—",
    status: "—",
    path: "/settings/templates",
    try: "Sample Sales Order Form · pick when creating a new sales deal (Deals → New)",
  },
];

export function portalUrl(token) {
  return `${DEMO_BASE_URL}/vendor/${token}`;
}
