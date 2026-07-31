import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { substitute, normalizeClauseText, normalizeClauseTitle, type TemplateVariable } from "@/lib/authoring";
import {
  allocateCommercialId,
  getCommercialType,
  listCommercialTypes,
  typeLabel,
  validateParentForType,
} from "@/lib/commercial-types";
import { linkDealAndContract, autoLinkContractByCommercialId } from "@/lib/commercial-link";
import { canAccessDeal } from "@/lib/procurement";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: uid, role } = session.user;

  const where = roleAtLeast(role, "MANAGER") ? {} : { createdById: uid };
  const rows = await prisma.contract.findMany({
    where,
    include: {
      template: { select: { name: true } },
      commercialType: true,
      parentContract: { select: { id: true, commercialId: true, title: true } },
    },
    orderBy: [{ commercialId: "asc" }, { updatedAt: "desc" }],
  });

  const types = await listCommercialTypes(true, "CONTRACT");

  return NextResponse.json({
    isAdmin: roleAtLeast(role, "ADMIN"),
    types,
    contracts: rows.map((c) => ({
      id: c.id,
      commercialId: c.commercialId,
      parentContractId: c.parentContractId,
      parent: c.parentContract,
      typePrefix: c.commercialType?.prefix ?? null,
      commercialTypeId: c.commercialTypeId,
      direction: c.commercialType?.direction ?? null,
      recordTypeLabel: c.commercialType ? typeLabel(c.commercialType) : null,
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

  const body = (await req.json()) as {
    templateId?: string;
    title?: string;
    variables?: Record<string, unknown>;
    commercialTypeId?: string;
    parentContractId?: string;
    dealId?: string;
  };

  if (!body.commercialTypeId) {
    return NextResponse.json({ error: "commercialTypeId required" }, { status: 400 });
  }
  const commercialType = await getCommercialType(body.commercialTypeId);
  if (!commercialType || commercialType.domain !== "CONTRACT" || !commercialType.active) {
    return NextResponse.json({ error: "invalid contract type" }, { status: 400 });
  }
  // Can only attach the new contract to a deal you can access (prevents injecting
  // an attacker-authored contract into someone else's deal).
  if (body.dealId && !(await canAccessDeal(actor, body.dealId))) {
    return NextResponse.json({ error: "you don't have access to that deal" }, { status: 403 });
  }

  const parentContractId = body.parentContractId?.trim() || null;
  if (commercialType.isRoot && parentContractId) {
    return NextResponse.json({ error: "master contract types cannot have a parent" }, { status: 400 });
  }
  if (parentContractId) {
    const check = await validateParentForType(parentContractId, body.commercialTypeId, "CONTRACT");
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  }

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

  const idPrefix = commercialType.prefix.replace(/^C(?=[A-Z])/, "");
  let commercialId: string;
  if (body.dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: body.dealId }, select: { commercialId: true } });
    commercialId = deal?.commercialId ?? (await allocateCommercialId(idPrefix));
  } else {
    commercialId = await allocateCommercialId(idPrefix);
  }

  const contract = await prisma.contract.create({
    data: {
      commercialId,
      commercialTypeId: body.commercialTypeId,
      parentContractId,
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
      title: normalizeClauseTitle(tc.clause.title),
      body: normalizeClauseText(substitute(tc.clause.body, vars)),
      sourceClauseId: tc.clause.id,
    })),
  });

  await recordAudit({
    action: "contract.create",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "CONTRACT",
    resourceId: contract.id,
    metadata: { templateKey: tpl.key, commercialId },
  });

  if (body.dealId) {
    await linkDealAndContract(body.dealId, contract.id);
  } else {
    await autoLinkContractByCommercialId(contract.id, commercialId);
  }

  const linkedDealId =
    body.dealId ??
    (
      await prisma.contract.findUnique({
        where: { id: contract.id },
        select: { dealId: true },
      })
    )?.dealId ??
    null;

  return NextResponse.json({ id: contract.id, commercialId, dealId: linkedDealId });
}
