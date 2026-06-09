import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { API_SCOPES, generateApiKey } from "@/lib/apikey";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await prisma.apiKey.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    scopes: API_SCOPES,
    keys: rows.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes ?? [],
      active: k.active,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };
  if (!roleAtLeast(actor.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json()) as { name?: string; scopes?: string[] };
  if (!b.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  const scopes = Array.isArray(b.scopes) ? b.scopes.filter((s) => API_SCOPES.includes(s)) : [];

  const { full, prefix, keyHash } = generateApiKey();
  const rec = await prisma.apiKey.create({
    data: { name: b.name.trim(), prefix, keyHash, scopes: scopes as Prisma.InputJsonValue, createdById: actor.id },
  });
  await recordAudit({
    action: "apikey.create",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "APIKEY",
    resourceId: rec.id,
    metadata: { name: rec.name, scopes },
  });
  // Full key returned ONCE; only the hash is stored.
  return NextResponse.json({ id: rec.id, prefix, key: full });
}
