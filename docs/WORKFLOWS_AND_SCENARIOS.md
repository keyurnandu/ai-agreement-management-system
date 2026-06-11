# Workflows & scenarios

End-user guide for the contract platform: what happens in each situation, who can do what, and how objects connect.

For architecture and deployment, see [ARCHITECTURE.md](./ARCHITECTURE.md) and [CLOUD.md](./CLOUD.md).

---

## Table of contents

1. [Core concepts](#1-core-concepts)
2. [Roles & permissions](#2-roles--permissions)
3. [Commercial hierarchy](#3-commercial-hierarchy)
4. [Deal lifecycle (status machine)](#4-deal-lifecycle-status-machine)
5. [Vendor portal](#5-vendor-portal)
6. [Scenario: Procurement — vendor uploads paper for review](#6-scenario-procurement--vendor-uploads-paper-for-review)
7. [Scenario: Sales — send master/order to customer](#7-scenario-sales--send-masterorder-to-customer)
8. [Scenario: Negotiation loop (issues & revisions)](#8-scenario-negotiation-loop-issues--revisions)
9. [Scenario: Compliance review](#9-scenario-compliance-review)
10. [Scenario: Approve and sign](#10-scenario-approve-and-sign)
11. [Scenario: Contract authoring (clause library)](#11-scenario-contract-authoring-clause-library)
12. [Scenario: Document attributes](#12-scenario-document-attributes)
13. [Scenario: Settings (org configuration)](#13-scenario-settings-org-configuration)
14. [Scenario: Analytics (sales & procurement portfolios)](#14-scenario-analytics-sales--procurement-portfolios)
15. [Scenario: Record navigation (Deal ↔ Contract ↔ Document)](#15-scenario-record-navigation-deal--contract--document)
16. [Email & notifications](#16-email--notifications)
17. [Demo data (after seed)](#17-demo-data-after-seed)
18. [Known limitations & not-yet-built](#18-known-limitations--not-yet-built)

---

## 1. Core concepts

| Object | Purpose | Typical user |
|--------|---------|--------------|
| **Deal** | Live negotiation workflow with a counterparty (vendor or customer). Portal, compliance, issues, signing. | Sales / Procurement |
| **Contract** | Structured clause library record (CSMCW, CPOR, etc.). Edit clauses → generate PDF. | Legal / Sales / Procurement |
| **Document** | PDF file (versions, annotations, attributes, Ask AI). | Anyone with access |
| **Agreement** | E-sign ceremony linked to a document. | After deal is approved |

**Rule of thumb**

- **Deals** = “we’re negotiating this counterparty relationship right now.”
- **Contracts** = “this is our legal text, clause by clause.”
- **Documents** = “this is the PDF on disk.”
- **Signing** starts from an **approved Deal**, not from Documents alone.

---

## 2. Roles & permissions

| Role | Typical access |
|------|----------------|
| **ADMIN** | Full org access |
| **MANAGER** | All deals, org settings, compliance packs, approve workflows |
| **EDITOR** | Create deals/contracts, edit documents, **define attributes** |
| **SIGNER** | Sign agreements assigned to them |
| **VIEWER** | Read-only; can view attributes, cannot define or edit definitions |

**Vendor / customer** — no login account. Access is via a **secret portal URL** only.

---

## 3. Commercial hierarchy

Separate trees for **sales** (org selling) and **procurement** (org buying).

```
Sales (deals)          Contracts (clause library)
─────────────────      ──────────────────────────
SMCW  (master)    ↔    CSMCW
  └ SCW (wrapper) ↔      └ CSCW
      └ SOR (order) ↔      └ CSOR
SAM (amendment)   ↔    CSAM

Procurement
─────────────────
PMCW  (master)    ↔    CPMCW
  └ PCW (wrapper) ↔      └ CPCW
      └ POR (order) ↔      └ CPOR
PAM (amendment)   ↔    CPAM
```

- **Master** (SMCW/PMCW): framework agreement.
- **PCW/SCW**: middle “wrapper” tier under master.
- **POR/SOR**: order form / PO — typically under wrapper, but can be **standalone** for tail spend.
- **PAM/SAM**: amendment on master or wrapper (not on order in seed hierarchy).

Deal IDs and contract IDs share the same commercial ID when linked (e.g. POR-1 deal ↔ POR-1 contract).

Configure allowed parent links in **Settings → Commercial hierarchy**. Parent attachment at create time is **optional** — hierarchy defines which parents are *valid when you choose to link*, not that you must always link.

### When to use which type (procurement examples)

| Scenario | Record type | Parent link |
|----------|-------------|-------------|
| Strategic vendor — full framework (MSA + orders) | PMCW → PCW → POR | Link each child to its parent |
| Existing master, new order only | **POR** | Link to existing **PCW** (or create PCW under PMCW first) |
| **Tail spend** — one-off PO, no framework | **POR** | **None** (standalone) |
| Single simple vendor agreement (one PDF, no orders) | **PMCW** | None (standalone master) |
| Change to existing master/wrapper | **PAM** | Link to PMCW or PCW being amended |

Same patterns apply on the sales side (SMCW / SCW / SOR / SAM).

When a parent **is** linked, counterparty email/name can inherit from the parent. When standalone, enter vendor details on the form.

---

## 4. Deal lifecycle (status machine)

```
DRAFT
  │  Procurement/Sales: "Send to counterparty"
  ▼
WITH_VENDOR ─────────────────────────────────────┐
  │  Vendor uploads PDF or edits clauses          │
  ▼                                              │
VENDOR_SUBMITTED                                 │
  │  Org: Run compliance check                   │
  ├──────────────────┬───────────────────────────┘
  ▼                  ▼
UNDER_REVIEW    ISSUES_OPEN ◄── Org adds issue manually
  │                  │              or compliance finds problems
  │                  │  Vendor fixes (upload / clause edit)
  │                  └──────────► VENDOR_SUBMITTED
  │  All issues resolved; Org: "Approve document"
  ▼
APPROVED
  │  Org: "Start signing"
  ▼
SIGNING ──► Counterparty signs via /sign/{token}
  ▼
COMPLETED (deal status; see limitations)
```

| Status | Meaning |
|--------|---------|
| **DRAFT** | Deal created; portal link works. Vendor **can upload** (submits for review). **Send to counterparty** emails the link and sets status to WITH_VENDOR. |
| **WITH_VENDOR** | Sent to counterparty; negotiation open. |
| **VENDOR_SUBMITTED** | Counterparty submitted a revision. |
| **UNDER_REVIEW** | Org reviewing; no open compliance issues. Vendor **view only**. |
| **ISSUES_OPEN** | Org raised issues; vendor can fix again. |
| **APPROVED** | Org accepted document; ready for signing. |
| **SIGNING** | E-sign in progress. |
| **COMPLETED** | Intended terminal state (see limitations). |

---

## 5. Vendor portal

### How access works

1. When a deal is **created**, the system generates a unique `vendorAccessToken`.
2. Portal URL: `{APP_BASE_URL}/vendor/{token}` (e.g. `http://localhost:3000/vendor/…`).
3. **No login** — anyone with the URL can open that deal’s portal.
4. The **same URL** is used for the entire deal; the token does not change.
5. There is **no expiration** today (link valid until the deal is deleted).

### How the vendor receives the link

| Method | When |
|--------|------|
| **Email** | When org clicks **Send to counterparty** (`EMAIL_PROVIDER=smtp`) |
| **Console (dev)** | Same action prints email to terminal if `EMAIL_PROVIDER=console` |
| **Manual copy** | Portal URL always shown on the deal page under workflow |

### What the vendor can do — by status

| Status | View PDF | Upload PDF | Edit clauses | Sign |
|--------|----------|------------|--------------|------|
| DRAFT | Yes | Yes | Yes** | No |
| WITH_VENDOR | Yes | Yes | Yes** | No |
| VENDOR_SUBMITTED | Yes | Yes | Yes** | No |
| ISSUES_OPEN | Yes | Yes | Yes** | No |
| UNDER_REVIEW | Yes | No | No | No |
| APPROVED | Yes | No | No | No |
| SIGNING | Yes | No | No | Yes*** |
| COMPLETED | Yes | No | No | No |

\** Only if a **contract is linked** to the deal; otherwise PDF upload only.  
\*** **Sign** opens a separate URL: `/sign/{recipientToken}`.

### PDF upload rules

- **PDF only** (not Word directly).
- Upload creates a **new document version**; changes appear in org **Revision changes** / activity log.
- After upload, status → **VENDOR_SUBMITTED**.

### Clause editing (preferred for linked contracts)

- Vendor edits clause text in the portal middle panel.
- Save regenerates the PDF preview.
- Matching **open issues** can auto-resolve when the vendor saves a fix.

---

## 6. Scenario: Procurement — vendor uploads paper for review

**Actors:** Procurement manager (logged in), Vendor (portal only).

### Org side

1. **Settings → Deal templates** — upload a PDF/Word template (optional).
2. **Settings → Compliance rules** — upload procurement rule pack (optional).
3. **Deals → Procurement → New deal**
   - Direction: Org buying
   - Type: e.g. POR or PMCW
   - Vendor email & name
   - **File template:** optional — skip for vendor-upload flows; pick one to seed a starting PDF
4. Open deal → **Send to counterparty**.
5. Copy portal link or rely on email.

### Vendor side

1. Open portal link (no login).
2. **Upload PDF** with their contract/redlines **or** edit clauses if a contract is linked.
3. Wait for org review.

### Org review

1. **Run compliance check** — may create issues → **ISSUES_OPEN**.
2. Review **Revision changes** (clause diffs or PDF line diff).
3. **Add issue manually** if needed → reopens negotiation.
4. When satisfied and no open issues → **Approve document**.
5. **Start signing** → vendor sees **Sign** in portal.

---

## 7. Scenario: Sales — send master/order to customer

Same flow as procurement, but:

- **Deals → Sales** and direction **Org selling**.
- Counterparty is the **customer** (stored as vendor email/name on the deal).
- Portal labels say “customer” instead of “vendor”.
- Use sales rule packs and templates (`ORG_SELLING`).

Typical path: SMCW master deal → child SCW → child SOR order form.

---

## 8. Scenario: Negotiation loop (issues & revisions)

```
Org sends deal
    → Vendor revises (upload or clauses)
    → VENDOR_SUBMITTED
    → Org compliance / manual review
         ├─ No issues → UNDER_REVIEW
         └─ Issues found → ISSUES_OPEN
              → Vendor fixes in portal
              → VENDOR_SUBMITTED
              → (repeat)
    → Org approves when open issues = 0
```

**Org can also edit** on the **Contract** tab and **Regenerate PDF** — vendor sees highlighted diffs in the portal on next load.

**Activity log** on the deal records sends, uploads, edits (with IP where captured).

---

## 9. Scenario: Compliance review

1. Ensure a **compliance rule pack** exists (**Settings → Compliance rules**), filtered by sales vs procurement direction.
2. On the deal (status WITH_VENDOR, VENDOR_SUBMITTED, UNDER_REVIEW, or ISSUES_OPEN), click **Run compliance check**.
3. AI compares document text to rules; may create **review issues**.
4. If issues created → status **ISSUES_OPEN**.
5. If no issues → status **UNDER_REVIEW**.

Issues appear on the deal and in the **vendor portal issues rail** (vendor clicks issue → jumps to clause).

---

## 10. Scenario: Approve and sign

### Approve

- Requires **zero open issues**.
- Button: **Approve document** (when status is UNDER_REVIEW, VENDOR_SUBMITTED, or ISSUES_OPEN with all issues resolved).
- Status → **APPROVED**. Vendor can view portal but **cannot** upload or edit.

### Start signing

- From **APPROVED**, click **Start signing**.
- Creates/links an **Agreement** on the deal’s document.
- Status → **SIGNING**.
- Vendor portal shows **Sign** → `/sign/{token}`.
- Org manages recipients and fields in **Agreements**.

Signing is **not** available from the Documents page alone — use the linked deal.

---

## 11. Scenario: Contract authoring (clause library)

**Path:** **Contracts → Sales** or **Contracts → Procurement**.

### New master contract

1. **New contract** (direction pre-selected from tab).
2. Picks type automatically (e.g. CSMCW for sales) → form with pre-filled template variables.
3. **Create with pre-filled clauses**.

### New child contract

1. On contracts list, click **+ Child** on a parent (e.g. PMCW → CPCW).
2. Choose child type if multiple allowed.
3. Create under parent in hierarchy.

### Edit & publish

1. Open contract → edit clauses inline.
2. **Generate document** / **Regenerate PDF** → creates/updates linked **Document**.
3. Link contract to deal via deal page **Link contract** panel or shared commercial ID.

Markdown **tables** in clause bodies render as HTML tables in the UI and PDF.

---

## 12. Scenario: Document attributes

### Define attributes (org)

**Settings → Document attributes**

- Create fields: name, type, AI prompt, optional document-type filter.
- **Editor+** can create/edit; **Viewer** can read only.
- Test extraction against sample text before saving.

Seeded examples: Effective Date, Order Total, Subscription Term, Parties, etc.

### Extract on a document

1. Open **Document** (or deal/contract with document tab).
2. **Attributes** panel (right) → **Run all**.
3. AI extracts values from PDF text; manual **set** overrides AI.

### Show/hide per document

- **Show / hide** in Attributes panel — chooses which fields display for **this document** (saved in browser).

### Use in analytics

- Portfolio **Analytics → Sales / Procurement** reads attributes like `effective_date`, `order_total` for start date, end date (computed from term), and contract value.

---

## 13. Scenario: Settings (org configuration)

**Settings** uses a left sidebar; each section loads on the right.

| Section | Purpose |
|---------|---------|
| **Organization** | Name, PDF header/footer branding |
| **Document attributes** | Define extracted fields |
| **Commercial hierarchy** | Master / wrapper / order / amendment types |
| **Deal templates** | PDF/Word templates for new deals |
| **Compliance rules** | Rule packs for compliance checks |

Legacy URLs redirect: `/settings/org` → Organization, `/attributes` → Document attributes.

---

## 14. Scenario: Analytics (sales & procurement portfolios)

**Analytics** in top nav → **Sales** or **Procurement** tab.

Table columns: ID, title, counterparty, type, phase (Draft / Executing / Completed), status, start/end dates, value.

- **Executing** = in negotiation (not draft, not completed).
- Values and dates fill in after attribute extraction or contract template variables.
- Filter by phase; search by name, ID, counterparty.

---

## 15. Scenario: Record navigation (Deal ↔ Contract ↔ Document)

On any linked record, tabs: **Document | Contract | Deal**.

- Switch context without losing related records.
- **Back** link respects direction (sales/procurement lists) and `from` query when drilling in from a list.

---

## 16. Email & notifications

Configure in `.env`:

| Variable | Default | Effect |
|----------|---------|--------|
| `EMAIL_PROVIDER` | `console` | Logs emails to terminal |
| `EMAIL_PROVIDER=smtp` | — | Sends real mail via SMTP |
| `APP_BASE_URL` | `http://localhost:3000` | Links in emails |

| Event | Recipient | Content |
|-------|-----------|---------|
| Send to counterparty | Vendor/customer email | Portal link |
| Vendor uploads revision | Deal owner (if configured) | Revision notice |
| Agreement send | Signers | Signing link |

Email failures do not block the workflow; portal URL remains on the deal page.

---

## 17. Demo data (after seed)

```bash
cd apps/web && npm run db:seed
```

| Login | Password | Role |
|-------|----------|------|
| `manager@local.test` | `Manager123!` | MANAGER |
| `admin@local.test` | `Admin123!` | ADMIN |
| `viewer@local.test` | `Viewer123!` | VIEWER |

**Sales tree:** SMCW-1 → SCW-1 → SOR-1 (Acme Industries)  
**Procurement tree:** PMCW-1 → PCW-1 → POR-1 (Anthropic)

Open **POR-1** deal → copy vendor portal URL → test upload in incognito.

---

## 18. Known limitations & not-yet-built

| Topic | Current behavior |
|-------|------------------|
| Vendor self-service intake | Vendor cannot create a deal; org must create first |
| Portal link expiry | No automatic expiry or revocation |
| Re-send to vendor | UI button only on **DRAFT**; use **Add issue** to reopen negotiation |
| UNDER_REVIEW editing | Vendor cannot upload until **ISSUES_OPEN** or back to WITH_VENDOR |
| Deal → COMPLETED | Deal status may not auto-update when agreement completes |
| Word upload in portal | PDF only; convert Word before upload |
| Vendor email verification | Portal is token-only; link possession = access |
| Org-wide attribute visibility prefs | Per-document show/hide is browser-local only |
| Vendor-initiated new contract | Not supported |

---

## Quick reference — “what should I do?”

| Goal | Where to go |
|------|-------------|
| Vendor submits procurement contract | Deals → Procurement → New deal → Send → vendor uses portal |
| Review vendor redlines | Deal page → Revision changes + Compliance |
| Ask vendor to fix clause 4 | Add issue → vendor edits in portal |
| Sign executed agreement | Approve → Start signing → Agreements |
| Author legal text | Contracts → New contract → Generate PDF |
| Extract contract value / dates | Document → Attributes → Run all |
| Define new extracted field | Settings → Document attributes |
| Portfolio view by vendor/value | Analytics → Sales or Procurement |
