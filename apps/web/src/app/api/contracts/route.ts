import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { substitute, type TemplateVariable } from "@/lib/authoring";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: uid, role } = session.user;

  const where = roleAtLeast(role, "MANAGER") ? {} : { createdById: uid };
  const rows = await prisma.contract.findMany({
    where,
    include: { template: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    contracts: rows.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.status,
      template: c.template?.name ?? null,
      documentId: c.documentId,
      updatedAt: c.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };
  if (!roleAtLeast(actor.role, "EDITOR")) {
    return NextResponse.json({ error: "you need editor access to author contracts" }, { status: 403 });
  }

  const body = (await req.json()) as { templateId?: string; title?: string; variables?: Record<string, unknown> };
  if (!body.templateId) return NextResponse.json({ error: "templateId required" }, { status: 400 });

  const tpl = await prisma.template.findUnique({
    where: { id: body.templateId },
    include: { clauses: { include: { clause: true }, orderBy: { order: "asc" } } },
  });
  if (!tpl) return NextResponse.json({ error: "template not found" }, { status: 404 });

  const vars = body.variables ?? {};
  const defs = (tpl.variables as unknown as TemplateVariable[] | null) ?? [];
  const missing = defs.filter((v) => v.required && !String(vars[v.key] ?? "").trim()).map((v) => v.label);
  if (missing.length) {
    return NextResponse.json({ error: `missing required: ${missing.join(", ")}` }, { status: 400 });
  }

  const contract = await prisma.contract.create({
    data: {
      title: body.title?.trim() || tpl.name,
      templateId: tpl.id,
      variables: vars as Prisma.InputJsonValue,
      createdById: actor.id,
      status: "DRAFT",
    },
  });

  await prisma.contractClause.createMany({
    data: tpl.clauses.map((tc, i) => ({
      contractId: contract.id,
      order: i + 1,
      title: tc.clause.title,
      body: substitute(tc.clause.body, vars),
      sourceClauseId: tc.clause.id,
    })),
  });

  await recordAudit({
    action: "contract.create",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "CONTRACT",
    resourceId: contract.id,
    metadata: { templateKey: tpl.key },
  });

  return NextResponse.json({ id: contract.id });
}
