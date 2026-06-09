import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

/**
 * Server-only environment access. Do NOT import this from edge middleware
 * (it touches the filesystem). The canonical source of these values is the
 * monorepo-root .env (loaded by next.config.mjs and the dev/setup scripts).
 */

function findRepoRoot(start: string = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, "utf8")) as { name?: string };
        if (json.name === "contract-platform") return dir;
      } catch {
        /* ignore malformed package.json while walking up */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fallback: assume we're running from apps/web.
  return resolve(start, "../../");
}

export const REPO_ROOT = findRepoRoot();

/** Resolve a possibly-relative local path against the monorepo root. */
export function resolveLocalPath(p: string): string {
  return isAbsolute(p) ? p : join(REPO_ROOT, p.replace(/^\.\//, ""));
}

type AuthProvider = "credentials" | "oidc";
type StorageKind = "local" | "s3";

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  APP_BASE_URL: process.env.APP_BASE_URL ?? "http://localhost:3000",

  AUTH_PROVIDER: (process.env.AUTH_PROVIDER ?? "credentials") as AuthProvider,
  AUTH_SECRET: process.env.AUTH_SECRET ?? "dev-only-change-me-please-32-chars-min",
  OIDC_ISSUER: process.env.OIDC_ISSUER ?? "",
  OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID ?? "",
  OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET ?? "",

  STORAGE_PROVIDER: (process.env.STORAGE_PROVIDER ?? "local") as StorageKind,
  STORAGE_LOCAL_ROOT: process.env.STORAGE_LOCAL_ROOT ?? "./data/files",
  S3_BUCKET: process.env.S3_BUCKET ?? "",
  S3_REGION: process.env.S3_REGION ?? "us-east-1",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "",

  SERVICE_JWT_SECRET: process.env.SERVICE_JWT_SECRET ?? "dev-shared-service-secret-change-me",
  PDF_ENGINE_URL: process.env.PDF_ENGINE_URL ?? "http://localhost:8001",
  INTELLIGENCE_URL: process.env.INTELLIGENCE_URL ?? "http://localhost:8002",
} as const;
