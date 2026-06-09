import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await prisma.clauseLibraryEntry.findMany({ orderBy: { title: "asc" } });
  return NextResponse.json({
    clauses: rows.map((c) => ({
      id: c.id,
      key: c.key,
      title: c.title,
      category: c.category,
      body: c.body,
      fallbacks: c.fallbacks ?? [],
      active: c.active,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };
  if (!roleAtLeast(actor.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json()) as {
    key?: string;
    title?: string;
    category?: string;
    body?: string;
    fallbacks?: unknown;
  };
  if (!b.key?.trim() || !b.title?.trim() || !b.body?.trim()) {
    return NextResponse.json({ error: "key, title and body are required" }, { status: 400 });
  }

  try {
    const row = await prisma.clauseLibraryEntry.create({
      data: {
        key: b.key.trim(),
        title: b.title.trim(),
        category: b.category ?? null,
        body: b.body,
        fallbacks: (b.fallbacks ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    await recordAudit({
      action: "clause.create",
      actorId: actor.id,
      actorEmail: session.user.email,
      resourceType: "CLAUSE",
      resourceId: row.id,
      metadata: { key: row.key },
    });
    return NextResponse.json({ id: row.id });
  } catch {
    return NextResponse.json({ error: `a clause with key "${b.key}" already exists` }, { status: 409 });
  }
}
