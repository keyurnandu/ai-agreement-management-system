# Switching to the cloud

Every external dependency sits behind an adapter chosen by the root `.env`. Move from the
local-first defaults to cloud by editing `.env` and restarting — **no application code changes.**

## 1. Storage → S3 (or any S3-compatible store)

```env
STORAGE_PROVIDER=s3
S3_BUCKET=my-contract-bucket
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
# S3-compatible (e.g. MinIO) — set an endpoint; path-style is used automatically:
S3_ENDPOINT=http://localhost:9000
```

The `S3Storage` adapter implements `put/get/delete/exists/list` + presigned URLs, identical
to the local filesystem adapter.

## 2. Database → Postgres

Prisma migrations are dialect-specific, so switching DB engines uses a fresh migration history.

1. In `apps/web/prisma/schema.prisma`: `datasource db { provider = "postgresql" }`
2. `.env`: `DATABASE_URL=postgresql://user:pass@host:5432/contract`
3. Create the schema (pre-production — starting fresh is fine):
   - **With migrations:** remove `apps/web/prisma/migrations/`, then `npm run db:migrate -w apps/web -- --name init`
   - **Without history:** `cd apps/web && npx prisma db push`
4. Seed: `npm run db:seed -w apps/web`

Keep one provider per environment (the committed SQLite migrations stay valid for SQLite).

## 3. Auth → OIDC / SSO (Okta, Entra, Auth0, …)

```env
AUTH_PROVIDER=oidc
OIDC_ISSUER=https://login.microsoftonline.com/<tenant>/v2.0
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
AUTH_SECRET=<openssl rand -base64 32>
APP_BASE_URL=https://your-app
```

Register the redirect URI `<APP_BASE_URL>/api/auth/callback/sso` with your IdP. Credentials
login remains available alongside SSO. OIDC users default to the `VIEWER` role — add
just-in-time role provisioning by mapping IdP claims in the Auth.js callbacks.

## 4. AI → hosted model

```env
AI_PROVIDER=anthropic        # or openai | ollama
ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY / OLLAMA_BASE_URL
# AI_MODEL=claude-sonnet-4-6
```

Used by summaries, analysis, RAG Q&A, and attribute extraction.

## 5. Vectors (RAG)

`VECTOR_STORE=pgvector|pinecone` (the on-disk default is used today; embeddings are computed
per request in the stateless intelligence service).

## Local cloud-like testing (optional — needs Docker)

```bash
docker compose up -d      # Postgres on 5432, MinIO on 9000 (console 9001)
```

Then point `DATABASE_URL` at Postgres and `S3_ENDPOINT` at `http://localhost:9000` (create the
bucket in the MinIO console at <http://localhost:9001>, login `minioadmin` / `minioadmin`).
