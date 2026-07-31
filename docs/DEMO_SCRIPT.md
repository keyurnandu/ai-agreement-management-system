# ContractIQ — Demo Script (Adobe Incubator)

A tight ~8-minute walkthrough that tells the story end-to-end. Everything below
runs locally on seeded demo data — no external services required.

---

## The one-liner

> **Every company runs on contracts. Most sign them blind.** ContractIQ unifies
> PDF, e-signature, and AI contract intelligence in one platform, so sales,
> procurement, and legal understand every agreement *before* it's signed —
> without a $200K CLM or a six-month rollout.

**Positioning:** Acrobat + DocuSign + a contract brain. Built on the Adobe stack
(PDF, Sign, Firefly-class AI), self-hostable, mid-market accessible.

---

## Before you present (2 min setup)

```bash
cd C:\Users\knandu\dev\contract-platform
npm run dev          # web :3000 · pdf-engine :8001 · intelligence :8002
```

- Open <http://localhost:3000> and **sign in** as `admin@local.test` / `Admin123!`.
- Top-right: toggle **dark/light** once so the room sees it adapts.
- If the demo data ever looks stale, reseed (see *Reset* at the bottom).

> Tip: keep a second **incognito** window ready — you'll paste a portal link
> into it to play the counterparty.

---

## The walkthrough

### 1. Dashboard — "the portfolio at a glance" (45s)
Land on **Home**. Point out the KPI row (agreements, completion rate, avg cycle
time, activity), the **8-week volume** chart, the **status donut**, the
**signing funnel**, and **upcoming renewals**.
> "This is live — every number is computed from real contract data, not a mockup."

### 2. Sales flow — Adobe → Microsoft (2 min)
Go to **Deals → Sales → SMCW-1 (Microsoft Master Agreement)**.
- **Contract tab:** the clauses are real, branded Adobe ↔ Microsoft, California law.
- Click **Run compliance check** → it flags real gaps ("Missing: Data protection",
  "Confidentiality", "Term & renewal") — *explainable, not a black box*.
- **Resolve / Waive** the issues in the panel (Adobe's side).
- **Approve → Start signing → Send for signature.** A per-recipient signing
  link is generated with sequential routing.
- Open the **Counterparty portal link** (copy it from the deal toolbar) in the
  incognito window → show the counterparty view (no login), issues visible,
  clause editing.

> Talking point: "Compliance is a **rule pack** per direction. It's deterministic
> and explainable — every finding says exactly what's missing and how to fix it."

### 3. Procurement flow — vendor paper → compliance (1.5 min)
Go to **Deals → Procurement → POR-3 (Slack)**.
- This vendor **submitted their own paper**. Click **Run compliance check** →
  6 findings on the vendor MSA (Security cert, Data processing/GDPR, Termination,
  Insurance, **auto-renewal deviation**, Audit rights).
> "The vendor's paper is missing everything Adobe requires — surfaced in seconds."

### 4. AI chat — the differentiator (2.5 min)
Click **Ask AI** anywhere. Show all four scopes:
- **On a document** (open a contract → Ask AI): *"What is our liability exposure?"*
  → grounded answer; click a **citation** → it highlights the clause **on the PDF**.
  Follow up: *"Is that a mutual cap?"* → it remembers the conversation.
- **On a deal** (POR-4 → Ask AI): *"What's blocking this deal?"* → lists the open
  issues + next step, from **live workflow state** (no LLM guesswork).
- **On a collection** (Documents → a collection → Ask AI): *"What governing law do
  these use?"* → aggregates the answer across every document.
- **On the portfolio** (Analytics → Ask AI): *"Which deals are at risk?"* /
  *"What's expiring in 90 days?"* / *"Total value in flight?"* → answered from the
  whole book of business, each answer **citing the deals**.

> Talking point: "Factual questions are answered instantly from **extracted data**
> — exact, no hallucination. Only open-ended questions hit the model. That's the
> token-optimization story: right context, right layer."

### 5. Close (30s)
Toggle to **light mode**, show the analytics portfolio table (values, dates,
stages populated).
> "Local-first today, cloud-ready tomorrow — storage, database, auth, and the AI
> provider all swap by one `.env` change. This is the contract-intelligence layer
> Adobe is missing between Acrobat and Sign."

---

## Likely questions

- **"Is the AI making things up?"** No — structured/factual questions are answered
  from extracted attributes and live deal state (deterministic). RAG answers cite
  their source and say "I don't know" when the context doesn't cover it.
- **"What model?"** Pluggable — Claude / OpenAI / Azure OpenAI / local Ollama /
  a zero-key mock. Embeddings are decoupled from the chat model.
- **"How hard to deploy?"** One command locally. Cloud = flip `.env`
  (S3, Postgres, OIDC/SAML, hosted LLM). No code changes.
- **"Data security?"** RBAC (5 roles), per-resource permissions, and an
  append-only audit trail on every state-changing action.

---

## Reset the demo (clean slate)

Stop the web dev server first (it holds the Prisma engine on Windows), then:

```bash
cd apps/web
rm prisma/dev.db*
npx dotenv -e ../../.env -- npx prisma migrate dev
npx dotenv -e ../../.env -- node scripts/seed.mjs     # pdf-engine on :8001 must be running
```

Restart `npm run dev` and **log in fresh** (a session from before a reset is stale).
