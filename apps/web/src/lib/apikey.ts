import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const API_SCOPES = [
  "documents:read",
  "documents:write",
  "agreements:read",
  "contracts:read",
  "attributes:read",
];

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Generate a new key: `cpk_<prefix>.<secret>`. Only the hash + prefix are stored. */
export function generateApiKey(): { full: string; prefix: string; keyHash: string } {
  const prefix = "cpk_" + randomBytes(6).toString("hex"); // cpk_ + 12 hex chars
  const secret = randomBytes(24).toString("base64url");
  const full = `${prefix}.${secret}`;
  return { full, prefix, keyHash: sha256(full) };
}

export interface ApiActor {
  keyId: string;
  scopes: string[];
  subject: string;
}

/** Validate `Authorization: Bearer cpk_...`. Returns the actor or null. */
export async function verifyApiKey(req: Request): Promise<ApiActor | null> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token.startsWith("cpk_") || !token.includes(".")) return null;

  const prefix = token.split(".")[0];
  const rec = await prisma.apiKey.findUnique({ where: { prefix } });
  if (!rec || !rec.active) return null;
  if (sha256(token) !== rec.keyHash) return null;

  void prisma.apiKey.update({ where: { id: rec.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return { keyId: rec.id, scopes: (rec.scopes as string[] | null) ?? [], subject: rec.createdById ?? "apikey" };
}

export function hasScope(actor: ApiActor, scope: string): boolean {
  return actor.scopes.includes(scope) || actor.scopes.includes("*");
}

/** For /api/v1 routes: returns the actor, or a NextResponse error to return directly. */
export async function authorizeApi(req: Request, scope: string): Promise<ApiActor | NextResponse> {
  const actor = await verifyApiKey(req);
  if (!actor) {
    return NextResponse.json({ error: "invalid or missing API key" }, { status: 401 });
  }
  if (!hasScope(actor, scope)) {
    return NextResponse.json({ error: `missing required scope: ${scope}` }, { status: 403 });
  }
  return actor;
}
