import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { deleteContractHard } from "@/lib/delete-resources";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const c = await prisma.contract.findUnique({
    where: { id },
    include: {
      clauses: { orderBy: { order: "asc" } },
      template: { select: { name: true } },
      commercialType: { select: { id: true, key: true, prefix: true, name: true, direction: true } },
    },
  });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(roleAtLeast(actor.role, "MANAGER") || c.createdById === actor.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sourceIds = [...new Set(c.clauses.map((cl) => cl.sourceClauseId).filter(Boolean) as string[])];
  const sources = sourceIds.length
    ? await prisma.clauseLibraryEntry.findMany({ where: { id: { in: sourceIds } }, select: { id: true, fallbacks: true } })
    : [];
  const labelsById = new Map(
    sources.map((s) => [s.id, ((s.fallbacks as { label: string }[] | null) ?? []).map((f) => f.label)]),
  );

  return NextResponse.json({
    id: c.id,
    title: c.title,
    status: c.status,
    commercialId: c.commercialId,
    commercialTypeId: c.commercialTypeId,
    commercialType: c.commercialType,
    parentContractId: c.parentContractId,
    template: c.template?.name ?? null,
    documentId: c.documentId,
    variables: c.variables,
    clauses: c.clauses.map((cl) => ({
      id: cl.id,
      order: cl.order,
      title: cl.title,
      body: cl.body,
      isDeviation: cl.isDeviation,
      sourceClauseId: cl.sourceClauseId,
      fallbackLabels: cl.sourceClauseId ? labelsById.get(cl.sourceClauseId) ?? [] : [],
    })),
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "ADMIN")) {
    return NextResponse.json({ error: "admin access required to delete contracts" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    await deleteContractHard(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "cannot delete contract";
    const status = msg.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: msg }, { status });
  }

  await recordAudit({
    action: "contract.delete",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "CONTRACT",
    resourceId: id,
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ ok: true });
}
