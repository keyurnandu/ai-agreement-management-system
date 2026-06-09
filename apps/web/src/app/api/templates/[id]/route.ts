import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const t = await prisma.template.findUnique({
    where: { id },
    include: {
      clauses: { include: { clause: { select: { id: true, key: true, title: true } } }, orderBy: { order: "asc" } },
    },
  });
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: t.id,
    key: t.key,
    name: t.name,
    description: t.description,
    active: t.active,
    variables: t.variables,
    clauses: t.clauses.map((tc) => ({ id: tc.clause.id, key: tc.clause.key, title: tc.clause.title })),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };
  if (!roleAtLeast(actor.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const b = (await req.json()) as {
    name?: string;
    description?: string | null;
    variables?: unknown;
    clauseIds?: string[];
    active?: boolean;
  };

  const data: Prisma.TemplateUpdateInput = {};
  if (b.name !== undefined) data.name = b.name;
  if (b.description !== undefined) data.description = b.description;
  if (b.variables !== undefined) data.variables = b.variables as Prisma.InputJsonValue;
  if (typeof b.active === "boolean") data.active = b.active;

  await prisma.template.update({ where: { id }, data });

  if (Array.isArray(b.clauseIds)) {
    await prisma.templateClause.deleteMany({ where: { templateId: id } });
    if (b.clauseIds.length) {
      await prisma.templateClause.createMany({
        data: b.clauseIds.map((cid, i) => ({ templateId: id, clauseId: cid, order: i + 1, required: true })),
      });
    }
  }

  await recordAudit({
    action: "template.update",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "TEMPLATE",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
