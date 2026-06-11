import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { substitute, normalizeClauseText, normalizeClauseTitle } from "@/lib/authoring";
import { renumberContractClauses } from "@/lib/contract-clauses";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(roleAtLeast(actor.role, "MANAGER") || contract.createdById === actor.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { sourceClauseId?: string; title?: string; body?: string };
  const vars = (contract.variables as Record<string, unknown> | null) ?? {};

  let title: string;
  let clauseBody: string;
  let sourceClauseId: string | null = null;
  let isDeviation = false;

  if (body.sourceClauseId) {
    const src = await prisma.clauseLibraryEntry.findUnique({ where: { id: body.sourceClauseId } });
    if (!src || !src.active) return NextResponse.json({ error: "clause not found in library" }, { status: 404 });
    title = normalizeClauseTitle(src.title);
    clauseBody = normalizeClauseText(substitute(src.body, vars));
    sourceClauseId = src.id;
  } else if (typeof body.title === "string" && body.title.trim() && typeof body.body === "string" && body.body.trim()) {
    title = normalizeClauseTitle(body.title);
    clauseBody = normalizeClauseText(body.body);
    isDeviation = true;
  } else {
    return NextResponse.json({ error: "sourceClauseId or title+body required" }, { status: 400 });
  }

  const maxOrder = await prisma.contractClause.aggregate({
    where: { contractId: id },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? 0) + 1;

  const created = await prisma.contractClause.create({
    data: {
      contractId: id,
      order,
      title,
      body: clauseBody,
      sourceClauseId,
      isDeviation,
    },
  });

  await recordAudit({
    action: "contract.clause.add",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "CONTRACT",
    resourceId: id,
    metadata: { clauseId: created.id, sourceClauseId, title },
  });

  const fallbacks = sourceClauseId
    ? ((await prisma.clauseLibraryEntry.findUnique({ where: { id: sourceClauseId }, select: { fallbacks: true } }))
        ?.fallbacks as { label: string }[] | null) ?? []
    : [];

  return NextResponse.json({
    id: created.id,
    order: created.order,
    title: created.title,
    body: created.body,
    isDeviation: created.isDeviation,
    sourceClauseId: created.sourceClauseId,
    fallbackLabels: fallbacks.map((f) => f.label),
  });
}
