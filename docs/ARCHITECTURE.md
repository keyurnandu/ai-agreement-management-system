# Architecture

## Principles

1. **Local-first, cloud-ready.** Nothing in application code talks to a cloud SDK
   directly. Every external dependency is reached through an *adapter* interface
   chosen at runtime by an environment variable. The local implementations
   (filesystem, SQLite, local accounts, mock/Ollama AI) require zero external
   services; the cloud implementations (S3, Postgres, OIDC, Claude/OpenAI) are
   drop-in replacements.
2. **Right tool per job (polyglot).** TypeScript for the web/UX and the
   system-of-record; Python for PDF heavy-lifting (PyMuPDF) and AI/analytics.
3. **Single system-of-record.** `apps/web` owns the database and the audit trail.
   The Python services are **stateless compute** — they receive inputs and return
   results; the web app persists and audits. (The intelligence service keeps its
   own vector index, which is derived data, not source-of-truth.)
4. **Audit everything.** Every state-changing action writes an append-only
   `AuditEvent`. This is a product requirement ("every interaction within the
   system"), not an afterthought.

## Components

### apps/web — Next.js (TypeScript)
- **UI**: React (App Router). PDF viewing via `pdf.js` in the browser.
- **Auth**: Auth.js (NextAuth). `credentials` provider for local accounts now;
  `oidc` provider behind the same `AuthProvider` switch for SSO later.
- **RBAC**: roles (`ADMIN`, `MANAGER`, `EDITOR`, `SIGNER`, `VIEWER`) + per-resource
  permission rows. Enforced in a single `authorize()` helper used by every route.
- **Persistence**: Prisma. `DATABASE_URL` selects SQLite (local) or Postgres (cloud).
- **Gateway**: server actions / route handlers call the Python services over HTTP,
  signing a short-lived **service JWT** the services verify.
- **Audit**: `recordAudit()` wraps every mutation.

### services/pdf-engine — FastAPI (Python, PyMuPDF)
Stateless PDF operations: render-to-image, text/table/image extraction, annotate,
form fill, redaction, page ops (merge/split/rotate/reorder), signature-field
placement & flattening, and **full content editing** (text/object level — the hard
Acrobat-Pro capability, hardened over later phases). Reads/writes bytes via the
storage adapter or receives bytes inline.

### services/intelligence — FastAPI (Python)
- **`AIProvider` abstraction**: `complete()`, `stream()`, `embed()`. Adapters:
  `mock` (deterministic, zero-dependency default), `ollama` (local), `anthropic`,
  `openai`. Selected by `AI_PROVIDER`.
- **RAG**: chunk → embed → vector store (`local` on-disk now; `pgvector`/Pinecone
  later) → retrieve → answer with citations.
- **Contract intelligence**: summaries, clause extraction & classification, risk
  flags, obligations/key-dates, version diff & redline suggestions.
- **Analytics**: metrics over the agreement corpus (cycle time, status funnel,
  renewals/expiry, value-at-risk).

## The five adapters

| Interface        | Env switch          | Local impl            | Cloud impl                 |
|------------------|---------------------|-----------------------|----------------------------|
| `StorageProvider`| `STORAGE_PROVIDER`  | `LocalFsStorage`      | `S3Storage` (boto3 / S3 SDK)|
| Database         | `DATABASE_URL`      | SQLite                | Postgres (via Prisma)      |
| `AuthProvider`   | `AUTH_PROVIDER`     | credentials           | OIDC / SAML                |
| `AIProvider`     | `AI_PROVIDER`       | `mock` / `ollama`     | `anthropic` / `openai`     |
| Vector store     | `VECTOR_STORE`      | on-disk               | `pgvector` / Pinecone      |

## Service-to-service auth

The web app holds `SERVICE_JWT_SECRET` and mints a short-lived HS256 token per
outbound call (claims: subject = acting user, scope = operation). The Python
services verify the signature and expiry before doing work. Swapping to asymmetric
keys / JWKS later is a config change in the same verification seam.

## Data model (owned by apps/web)

```
User ─< Membership >─ Role
User ─< Permission >─ (Document | Agreement)        # per-resource ACL
Document ─< DocumentVersion                          # immutable versions
Agreement ─ Document
Agreement ─< Recipient (routingOrder, role)          # signer/approver/cc
Agreement ─< Field (type, page, x,y,w,h, recipient) # signature/initial/date/text
AuditEvent (actor, action, resourceType, resourceId, metadata, createdAt)
```

Status state machine for `Agreement`:
`DRAFT → SENT → IN_PROGRESS → (COMPLETED | DECLINED | VOIDED | EXPIRED)`

## Why no Docker / Java in the MVP

The dev machine has neither installed. SQLite + filesystem removes all local
infrastructure; the adapter seams mean adopting Postgres/S3 (and, if ever needed, a
Java service) later requires no rework. Optional MinIO/Postgres via Docker can be
added to exercise the cloud adapters locally.

## Contracts as data (structured-first)

A document is a *rendering* of a contract, not the contract itself. The source of
truth is a **canonical Contract data model** — typed fields for parties, term,
payment, renewal, and an ordered list of **clauses** (each referencing a clause-library
entry + the actual text + whether it deviates from the approved standard).

Two on-ramps populate the same model:

```
  Own paper (sales/standard)              Third-party / vendor paper
  ───────────────────────────            ───────────────────────────
  Template + clause library              Upload PDF/DOCX
        │  (author, customize)                 │  (intelligence service)
        ▼                                       ▼
        └──────────►  Canonical Contract model  ◄──────── extract & map
                              │
                 render ──────┼────── e-sign (Phase 2)
              (PDF/DOCX)      │
                       analytics / AI / obligations  (operate on fields, not parsing)
```

Design rules:
- **Render down, don't parse up** for own paper: never treat a hand-edited PDF as the
  master once a structured contract exists.
- **Clause library with fallbacks + guardrails**, not a frozen template: standardize
  language while allowing tracked deviations and approval triggers.
- **One schema, two paths**: authored and ingested contracts are indistinguishable
  downstream, so every system reads them the same way.

(Capability lands in Phase 2.5; the Acrobat-style PDF editing in Phase 1 serves mainly
inbound third-party paper and markup.)

## Custom attributes & prompt-based extraction

`AttributeDefinition` rows are the configurable extraction schema: each has a `key`,
`label`, `type` (TEXT/DATE/NUMBER/BOOLEAN/ENUM), a natural-language `prompt`, and a
`scope` (document/contract/both). The intelligence service runs an attribute's prompt
against the document's extracted text and writes an `AttributeValue` (value + confidence
+ source + method=AI|MANUAL). Authored contracts populate values directly; ingested paper
populates them via extraction — both feed the same canonical model and the analytics/API
layers. The attribute tables ship in Phase 2.5; the extraction execution is Phase 3.

## External API layer (Phase 6)

Two distinct surfaces share the same services/data:
- **App routes** (`/api/*`) — session-cookie auth, used by the web UI (today).
- **Public API** (`/api/v1/*`) — `Authorization: Bearer <api-key>` with per-key scopes;
  stable, versioned, OpenAPI-documented; for external systems. Webhooks push events
  (`agreement.completed`, `attribute.extracted`, …). Both call the same domain logic, so
  there is one source of truth — the public API is a thin, authorized projection of it.
