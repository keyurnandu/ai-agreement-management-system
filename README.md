# contract-platform

A self-hostable **Acrobat + DocuSign + contract-intelligence** platform.

Read & edit PDFs, run agreement/e-signature workflows with RBAC + SSO, capture a
full audit trail of every interaction, and layer AI (Claude / OpenAI / local) for
summaries, clause & risk extraction, negotiation help, and analytics.

**Local-first, cloud-ready:** every external dependency (storage, database, auth,
AI provider, vector store) sits behind an adapter chosen by an environment variable.
Develop locally on SQLite + the filesystem today; flip to Postgres + S3 + OIDC + a
hosted LLM later by editing `.env` — no code rewrite.

---

## Architecture at a glance

```
                         ┌─────────────────────────────┐
  Browser  ───────────▶  │  apps/web  (Next.js / React) │
                         │  UI · Auth.js · RBAC · Prisma│  ◀── owns ALL persistence
                         │  audit log · API gateway     │      + the audit trail
                         └───────────┬─────────────────┘
                      service JWT    │
                ┌────────────────────┴───────────────────┐
                ▼                                         ▼
   ┌────────────────────────┐               ┌────────────────────────────┐
   │ services/pdf-engine     │               │ services/intelligence       │
   │ FastAPI · PyMuPDF       │               │ FastAPI · pluggable LLM      │
   │ render/edit/forms/      │               │ RAG · clause/risk extraction │
   │ redact/pageops/sign     │               │ analytics · embeddings       │
   └────────────────────────┘               └────────────────────────────┘
```

Five swappable adapters (set in `.env`):

| Adapter   | Local default        | Cloud target            |
|-----------|----------------------|-------------------------|
| Storage   | filesystem           | S3 (or MinIO)           |
| Database  | SQLite               | Postgres                |
| Auth      | local accounts       | OIDC / SAML (Okta/Entra)|
| AI        | `mock` (zero keys)   | Claude / OpenAI / Ollama|
| Vectors   | on-disk              | pgvector / Pinecone     |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

---

## Prerequisites

- **Node.js ≥ 20** (`node -v`)
- **Python ≥ 3.11** (`python --version`)
- No Docker required for local development.

## Quick start

```powershell
# 1. Configure
copy .env.example .env          # then edit AUTH_SECRET etc.

# 2. One-time setup: installs JS deps, creates Python venvs,
#    runs DB migrations, seeds an admin user.
npm install
npm run setup

# 3. Run everything (web + pdf-engine + intelligence) with one command
npm run dev
```

Then open <http://localhost:3000>. Default seeded login is printed by the seed
script (see `apps/web/scripts/seed.mjs`).

| Service            | URL                     |
|--------------------|-------------------------|
| Web app / gateway  | http://localhost:3000   |
| PDF engine (docs)  | http://localhost:8001/docs |
| Intelligence (docs)| http://localhost:8002/docs |

## Switching to the cloud (later)

Edit `.env` only:

```env
DATABASE_URL=postgresql://user:pass@host:5432/contract
STORAGE_PROVIDER=s3
S3_BUCKET=my-bucket
AUTH_PROVIDER=oidc
OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
VECTOR_STORE=pgvector
```

Run `npm run db:migrate` against Postgres and redeploy. No application code changes.

## Repository layout

```
apps/web/                Next.js app — UI, auth, RBAC, persistence, audit, gateway
services/pdf-engine/     FastAPI — PyMuPDF-based PDF read/edit engine
services/intelligence/   FastAPI — pluggable AI, RAG, analytics
packages/shared-types/   Shared TypeScript domain types
scripts/                 setup.mjs (bootstrap) · dev.mjs (run all)
docs/                    Architecture & phased plan
data/                    Local runtime data (gitignored): files, sqlite, vectors
```
