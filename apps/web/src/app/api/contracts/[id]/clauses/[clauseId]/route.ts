import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { substitute } from "@/lib/authoring";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; clauseId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id, clauseId } = await ctx.params;
  const contract = await prisma.contract.findUnique({ where: { id } });
  if (!contract) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(roleAtLeast(actor.role, "MANAGER") || contract.createdById === actor.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const clause = await prisma.contractClause.findUnique({ where: { id: clauseId } });
  if (!clause || clause.contractId !== id) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json()) as { body?: string; fallbackIndex?: number; reset?: boolean };
  const vars = (contract.variables as Record<string, unknown> | null) ?? {};

  let newBody = clause.body;
  let isDeviation = clause.isDeviation;

  if (body.reset && clause.sourceClauseId) {
    const src = await prisma.clauseLibraryEntry.findUnique({ where: { id: clause.sourceClauseId } });
    if (src) {
      newBody = substitute(src.body, vars);
      isDeviation = false;
    }
  } else if (typeof body.fallbackIndex === "number" && clause.sourceClauseId) {
    const src = await prisma.clauseLibraryEntry.findUnique({ where: { id: clause.sourceClauseId } });
    const fbs = ((src?.fallbacks as { label: string; text: string }[] | null) ?? [])[body.fallbackIndex];
    if (fbs) {
      newBody = substitute(fbs.text, vars);
      isDeviation = true;
    }
  } else if (typeof body.body === "string") {
    newBody = body.body;
    isDeviation = true;
  }

  const updated = await prisma.contractClause.update({
    where: { id: clauseId },
    data: { body: newBody, isDeviation },
  });

  await recordAudit({
    action: "contract.clause.update",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "CONTRACT",
    resourceId: id,
    metadata: { clauseId, isDeviation },
  });

  return NextResponse.json({ id: updated.id, body: updated.body, isDeviation: updated.isDeviation });
}
