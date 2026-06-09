import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Primary env source for the web app is apps/web/.env (generated from the
// monorepo-root .env by scripts/setup.mjs + scripts/dev.mjs) — Next loads it
// natively. As a convenience for bare `next` invocations we also try to load
// the root .env directly; dotenv is optional, so a missing module is ignored.
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const { config } = await import("dotenv");
  config({ path: resolve(__dirname, "../../.env") });
} catch {
  /* dotenv not installed — apps/web/.env is already loaded by Next */
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: "25mb" }, // headroom for PDF uploads later
  },
};

export default nextConfig;
