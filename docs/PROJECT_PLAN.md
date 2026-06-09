# Project plan

Vision: a contract-intelligence platform combining Acrobat-style PDF read/edit with
DocuSign-style agreement management — access control, SSO, full audit trail, an AI
layer (Claude/OpenAI/local) for negotiation help & insights, and analytics — for
sales/procurement contract workflows. Local-first, cloud-ready.

## Decisions locked (2026-06-03)

- **Stack:** service-oriented monorepo. TypeScript (Next.js) web+gateway; Python
  (FastAPI) for the PDF engine and the AI/analytics service. Java deferred (optional
  future service; no JDK locally and no near-term need).
- **PDF scope:** target full content editing (Acrobat-Pro level) via PyMuPDF,
  delivered progressively — solid annotate/forms/page-ops/sign first, in-place
  text/object editing hardened later. (Perfect Word-style reflow is out of scope.)
- **AI:** pluggable provider with a local-LLM option. Ships with a zero-key `mock`
  default; `ollama`, `anthropic`, `openai` adapters enabled via `.env`.
- **Auth:** pluggable — local accounts now, OIDC/SAML (Okta/Entra) ready behind the
  same seam.
- **Local infra:** SQLite + filesystem (no Docker). Adapters flip to Postgres + S3.
- **Project location:** outside OneDrive (avoids node_modules/.venv sync issues).
- **Contracts-as-data (2026-06-04):** a canonical structured Contract model is the
  source of truth; documents are rendered from it (own paper) or extracted into it
  (third-party paper). "Standard format" = clause library + fallbacks, not a frozen
  doc. See Phase 2.5.
- **Custom attributes + extraction & external API (2026-06-04):** define attributes
  (label/type/prompt) and extract structured values from documents/contracts (Phase 3);
  expose everything through a versioned, API-key-authed external API + webhooks
  (Phase 6). Attribute models added to the schema in Phase 2.5 as groundwork.

## Phases

### Phase 0 — Foundations  ◀ in progress
Monorepo, all three services boot, the five adapters with local implementations,
full DB schema + migrations, RBAC + audit skeleton, service-JWT seam, one-command
setup & dev runner, seeded admin, login → dashboard shell.
**Done = everything runs locally end-to-end (with stubs).**

### Phase 1 — Documents & PDF core
Upload (storage adapter) · document library · in-browser viewer (pdf.js) ·
annotate/comment · form fill · page ops (merge/split/rotate/reorder) ·
text/table/image extraction · immutable versioning · audit on every action.

### Phase 2 — Agreements & e-signature
Recipients + routing order (sequential/parallel) · drag-to-place fields ·
signing ceremony (tokenized links) · status state machine · reminders/expiry ·
certificate of completion · RBAC enforcement · full audit trail + export.

### Phase 2.5 — Structured authoring & templates (contracts-as-data)
A **canonical Contract data model** is the source of truth (parties, term, clauses,
payment, obligations, custom fields). Two creation paths converge on it:
- **Your paper (sales / standard):** author from a **Template** assembled out of a
  **clause library** — each clause has an approved *standard* version + pre-approved
  *fallbacks* + guardrails (who may deviate, when legal approval triggers).
  Customizable; deviations from standard are tracked. The PDF/DOCX is **rendered from**
  the structured contract, never hand-edited as the master.
- **Third-party / vendor paper:** ingest the uploaded PDF/DOCX and use the
  intelligence service to **extract & map** it onto the same model for review.

Because both paths land in one schema, "any system can read it" holds by construction,
and analytics/AI operate on structured fields instead of re-parsing documents. Pairs
naturally with Phase 2 (e-signature renders & sends the structured contract).

### Phase 3 — Contract intelligence
Enable real AI providers · document summaries · clause extraction & classification ·
risk flags · obligations & key-date extraction · RAG Q&A with citations ·
version diff & redline/negotiation suggestions.

**Custom attributes & prompt-based extraction:** user-defined `AttributeDefinition`s
(label + type + extraction prompt + scope) that the intelligence service runs against a
document/contract to populate structured `AttributeValue`s (with confidence + source +
manual override). Authored contracts are born with these values; ingested third-party
paper gets them via extraction — both land in the same canonical model.

### Phase 4 — Analytics
Metrics pipeline + dashboard: cycle time, signing funnel, volume by
status/owner/counterparty, renewals/expiry calendar, value-at-risk, turnaround.

### Phase 5 — Cloud switch & advanced editing
Flip adapters to S3/Postgres/OIDC/hosted-LLM · optional MinIO/Postgres via Docker to
exercise cloud paths locally · harden full-content PDF editing · optional Java
service if a need emerges.

### Phase 6 — External API layer
A versioned public REST API (`/api/v1/...`) with **API-key auth + scopes** (issue/revoke
keys per integration), exposing documents, contracts, agreements, and attribute
values/extraction for programmatic access by any system. **Webhooks** for events
(`agreement.completed`, `attribute.extracted`, `document.uploaded`). Published **OpenAPI**
spec + a generated typed client. This is the concrete realization of "any system can read
it" and is kept distinct from the session-based app routes used by the web UI.

## Status log

- **2026-06-03** — Requirements clarified; architecture finalized; Phase 0 started.
- **2026-06-03** — Phase 0 complete & verified: JS deps installed; Prisma client +
  migration + seeded users; both Python venvs installed; Next.js production build
  passes type-check (6 routes + middleware); pdf-engine (8001) & intelligence (8002)
  boot and pass /health; service-JWT seam verified (401 without token, 200 with);
  live mock-AI summarize call succeeded. Ready for Phase 1.
- **2026-06-04** — Phase 1 document backbone DONE & verified end-to-end: upload
  (storage adapter + %PDF magic check), document library (RBAC-filtered), server-
  rendered viewer (PyMuPDF→PNG, page nav, zoom), text-extraction tab, page ops
  (rotate/delete/reorder) producing immutable new versions, version history, and an
  audit event on every action. Engine endpoints render/page-ops/form-fields/fill-form
  implemented. Verified via scripted NextAuth login → upload(3p) → render(PNG) →
  extract(447 chars) → rotate(v2) → delete(v3,2p), with all 4 audit events persisted.
  Phase 1 REMAINING: annotations/comments UI+API (DB model ready), form-fill UI,
  merge/split.
- **2026-06-04** — Annotations DONE & verified (create/list/resolve/delete via API,
  overlay pins + Comments tab + comment-mode in viewer, RBAC + audit). Form-fill DONE
  & verified (engine form-fields/fill-form; viewer Form tab; verified upload→render→
  list field `vendor_name`→fill "Acme Corp"→v2→re-read confirms). Phase 1 REMAINING:
  merge/split only. Also captured the **contracts-as-data** direction (canonical
  Contract model + clause library + dual ingestion) as Phase 2.5 in plan + architecture.
- **2026-06-04** — Merge/split DONE & verified (engine /pdf/merge + /pdf/split; web
  routes; viewer "Document tools" card). Verified: upload A(2p) → merge B → v2/3p →
  split "1,3" → new doc 2p → renders. **PHASE 1 COMPLETE.** Full PDF core: upload,
  library, viewer (render/zoom/text), annotate, form-fill, page-ops, merge, split,
  versioning, audit. Next: Phase 2.5 structured authoring or Phase 2 e-sign.
- **2026-06-04** — **PHASE 2 (e-signature) COMPLETE & verified.** Engine /pdf/stamp;
  agreement build API (create from doc, recipients, click-to-place fields, send with
  per-recipient tokens + routing); public token-gated signing API (payload/render/
  complete) with status state machine (DRAFT→SENT→IN_PROGRESS→COMPLETED) and
  finalization that stamps signed values into a new PDF version. UI: agreements list,
  builder (recipients + field placement overlay), detail/status with signing links,
  public /sign/[token] ceremony. Verified end-to-end: build→send→public sign→COMPLETED,
  1 signed version, full audit chain (create/add/field/send/view/sign/completed). All
  Phase 2 pages render 200. Deferred Phase 2 polish: decline flow, reminders/expiry
  automation, certificate-of-completion PDF, drawn (vs typed) signatures, parallel-
  routing UI toggle. Next: Phase 2.5 structured authoring or Phase 3 AI.
- **2026-06-04** — UI polish: fixed signing-field contrast bug (typed signature was
  white-on-white → now dark text on a light-yellow field via `.sigfield`); added a
  global top nav (Dashboard/Documents/Agreements + user/sign-out) via an `(app)`
  layout; refined buttons/inputs/badges and builder field tags. Build green; all app
  pages render 200 with the nav. User-requested order: UI polish → e-sign polish →
  structured authoring. Next: e-sign polish (certificate/decline/reminders/drawn sig).
- **2026-06-04** — E-sign polish DONE & verified: certificate-of-completion page
  appended on completion (engine /pdf/text-page + merge); decline-to-sign flow
  (recipient → agreement DECLINED); drawn signatures (canvas → PNG data URL → engine
  /pdf/stamp inserts as image; typed still supported); parallel-routing toggle + expiry
  (days) in builder; expiry enforcement (→ EXPIRED) in signing; manual reminder
  (audited). Verified: decline→DECLINED+reminder; parallel both-SENT + drawn sig +
  COMPLETED with certificate page (2-page signed PDF from 1-page doc); expiry→EXPIRED.
  Build green (19 API routes). **Phase 2 + polish COMPLETE.** Next: Phase 2.5 structured
  authoring (per user sequence: UI → e-sign polish → structured authoring).
- **2026-06-05** — Phase 2.5 first slice DONE & verified: schema for ClauseLibraryEntry/
  Template/TemplateClause/Contract/ContractClause + AttributeDefinition/AttributeValue
  (attribute models = groundwork for Phase 3 extraction); seeded clause library + Mutual
  NDA template (6 vars) + 4 attribute defs; authoring API (templates list, contract
  create w/ clause assembly + {{var}} substitution, generate → render via engine
  /pdf/text-page → Document v1 + link); UI (/contracts, /contracts/new picker + variable
  form, /contracts/[id] assembled-clause view + Generate). Verified: NDA → 5 substituted
  clauses → generated PDF text has all values → GENERATED + linked doc (flows into
  e-sign). Build green (22 API routes). Roadmap gained Phase 3 prompt-based attribute
  extraction + Phase 6 external API. REMAINING in 2.5: clause-library/template admin UI,
  fallback-swap + deviation editing, multi-page contract rendering.
- **2026-06-05** — Authoring FINISHED + attribute extraction DONE & verified:
  (1) multi-page contract rendering (engine /pdf/text-page paginates);
  (2) contract clause editing — swap to approved fallback / free-edit → isDeviation,
  reset-to-standard (PATCH /api/contracts/[id]/clauses/[clauseId]); ContractView UI;
  (3) clause-library admin (/clauses, GET/POST /api/clauses, PATCH /api/clauses/[id],
  manager-gated, fallbacks editor);
  (4) **prompt-based attribute extraction** — AIProvider.extract (base uses complete()
  per attribute; MockProvider heuristic by type/key, key-free); POST /ai/extract;
  POST /api/documents/[id]/extract (engine text → intelligence → store AttributeValues,
  method AI) + GET/PATCH /api/documents/[id]/attributes (manual override); AttributesPanel
  on the document viewer (Run extraction + set). Verified: fallback swap→deviation;
  long clause→page-2 (multipage); mock extraction got effective_date/term/governing-law/
  auto-renewal right; manual override→MANUAL; clause create. Build green (26 API routes).
  (Template-builder admin UI still deferred.) Next: Phase 3 broader AI (summaries/risk/
  RAG, real providers) or Phase 6 external API.
- **2026-06-05** — **PHASE 3 (AI insights) DONE & verified.** AIProvider.analyze (base:
  STRICT-JSON via complete(); MockProvider: heuristic summary + risk flags + obligations
  + key_dates, key-free) and RAG via app/core/rag.py (chunk + cosine): /ai/analyze,
  /ai/ask (embed chunks+question → cosine top-k → complete with cited context). Web:
  lib/documents.getDocumentText(); POST /api/documents/[id]/analyze and /ask (RBAC VIEW,
  audit); intelligence client analyze/ask. UI: InsightsPanel on the document viewer
  (Analyze → summary/risks/obligations/key-dates; Q&A box → answer + citations). Verified
  on generated NDA: analyze gave summary + 1 obligation + 2 key dates; ask returned answer
  + 2 real citations. Build green (28 API routes). Enable real output: set AI_PROVIDER +
  key in root .env (anthropic/openai/ollama) and restart. Next: Phase 6 external API, or
  deferred template-builder UI, or P4 analytics.
- **2026-06-05** — **Template-builder admin DONE & verified** (last authoring piece).
  API: POST /api/templates, GET/PATCH /api/templates/[id] (create/detail/update;
  clauseIds reorder, variables, active; manager-gated; ?all=1 includes inactive). UI:
  two-pane /templates (TemplateAdmin) styled per the user's Acrobat-Analyzer reference —
  list (name/#clauses/#vars/enable toggle) + editor (name/description, variable rows,
  ordered clause picker with ↑↓/remove, active). Linked from /contracts (Clause library |
  Templates | New contract). Verified: create→detail-in-order→contract assembles w/
  substitution→reorder+deactivate→hidden from active picker but in ?all. Build green
  (30 API routes). **AUTHORING FULLY COMPLETE.** Next candidates: attribute-UI upgrade to
  match reference (groups, document type, Strict/Flexible mode, inclusion/exclusion
  examples, Test action, enable toggle); Phase 6 external API; P4 analytics.
- **2026-06-05** — **PHASE 4 (analytics) DONE & verified.** lib/analytics.getAnalytics
  (Prisma aggregation in web — no Python round-trip): totals, completion rate, cycle time
  (avg/median), agreement-status distribution, signing funnel, 8-week volume,
  contracts-by-template, upcoming expiries + attribute-derived renewals (effective_date +
  term_months → renewal date, ≤180d), 7-day activity. GET /api/analytics (scope by role).
  /analytics dashboard with dependency-free CSS/flex charts (stat cards, bars, funnel,
  volume columns, table); added to nav + dashboard card. Verified on existing test data:
  5 agreements / 3 completed (60%) / status COMPLETED=3 DECLINED=1 EXPIRED=1 / funnel
  6→4→4 / templates NDA=3 / activity 86 / page 200. Build green (31 API routes).
  **Phases 0–4 + e-sign polish + structured authoring + attribute extraction + AI insights
  ALL DONE.** Remaining: attribute-UI upgrade (per reference); Phase 6 external API;
  Phase 5 cloud switch. Still uncommitted to git.
- **2026-06-05** — **git: initial commit 296de84** (Phases 0-4) on main.
- **2026-06-05** — **Attribute-UI upgrade DONE & verified** (per Acrobat-Analyzer
  reference). Schema: AttributeDefinition + group/documentType/mode(STRICT|FLEXIBLE)/
  inclusionExamples/exclusionExamples/updatedAt. API: /api/attributes (GET grouped,
  POST), /api/attributes/[id] (PATCH + enable toggle), /api/attributes/test (run one
  attribute vs sample text/doc → value). Extraction wiring: mode + examples flow into
  intelligence /extract; base.extract prompt uses strict/flexible + inclusion/exclusion.
  UI: two-pane /attributes (AttributesAdmin) — grouped list w/ enable toggle + create/edit
  form (name/group/type/document-type/mode/description, Advanced inclusion+exclusion
  examples, Save + Test). Nav link. Verified: grouped list, create w/ examples, Test →
  "60", toggle, page 200. Build green (35 API routes). Remaining: Phase 6 external API;
  Phase 5 cloud switch.
- **2026-06-05** — **PHASE 6 (external API) DONE & verified.** ApiKey + WebhookSubscription
  models. lib/apikey (cpk_ keys, sha256 hash, scopes, verifyApiKey/authorizeApi) +
  lib/webhooks (emitEvent → signed POST with X-CP-Signature HMAC, records status).
  Session admin API: /api/keys (GET/POST create→full key once/[id] DELETE), /api/webhooks
  (GET/POST create→secret once/[id] DELETE), manager-gated. External /api/v1 (API-key +
  scope): documents (list/[id]/attributes), agreements (list/[id]), openapi.json (public).
  /api/v1 added to auth public prefixes. emitEvent wired at document.uploaded,
  agreement.completed, attribute.extracted, contract.generated. Developer UI (/developer):
  keys + webhooks management. Verified: scopes (401/403), v1 list, OpenAPI, **signed
  webhook delivered with valid HMAC**. Build green (45 API routes). Remaining: Phase 5
  cloud switch (S3/Postgres/OIDC/hosted-LLM).
