import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ?all=1 returns inactive templates too (for the admin); default = active only (picker).
  const all = new URL(req.url).searchParams.get("all") === "1";
  const tpls = await prisma.template.findMany({
    where: all ? {} : { active: true },
    include: { _count: { select: { clauses: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    templates: tpls.map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      description: t.description,
      variables: t.variables,
      clauses: t._count.clauses,
      active: t.active,
      updatedAt: t.updatedAt,
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
    name?: string;
    description?: string;
    variables?: unknown;
    clauseIds?: string[];
  };
  if (!b.key?.trim() || !b.name?.trim()) {
    return NextResponse.json({ error: "key and name are required" }, { status: 400 });
  }

  try {
    const t = await prisma.template.create({
      data: {
        key: b.key.trim(),
        name: b.name.trim(),
        description: b.description ?? null,
        variables: (b.variables ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
    if (Array.isArray(b.clauseIds) && b.clauseIds.length) {
      await prisma.templateClause.createMany({
        data: b.clauseIds.map((cid, i) => ({ templateId: t.id, clauseId: cid, order: i + 1, required: true })),
      });
    }
    await recordAudit({
      action: "template.create",
      actorId: actor.id,
      actorEmail: session.user.email,
      resourceType: "TEMPLATE",
      resourceId: t.id,
      metadata: { key: t.key },
    });
    return NextResponse.json({ id: t.id });
  } catch {
    return NextResponse.json({ error: `a template with key "${b.key}" already exists` }, { status: 409 });
  }
}
