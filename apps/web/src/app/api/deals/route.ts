import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { copyDocumentFromTemplate, createPlaceholderDocument, dealStatusLabel, vendorToken } from "@/lib/procurement";
import {
  allocateCommercialId,
  getCommercialType,
  legacyRecordType,
  listCommercialTypes,
  typeLabel,
  validateParentForType,
  type DealDirection,
} from "@/lib/commercial-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: uid, role } = session.user;

  const where = roleAtLeast(role, "MANAGER") ? {} : { ownerId: uid };
  const deals = await prisma.deal.findMany({
    where,
    orderBy: [{ commercialId: "asc" }, { updatedAt: "desc" }],
    include: {
      fileTemplate: { select: { name: true } },
      rulePack: { select: { name: true } },
      commercialType: true,
      parentDeal: {
        select: { id: true, commercialId: true, title: true, commercialType: { select: { prefix: true } } },
      },
      childDeals: {
        select: { id: true, commercialId: true, title: true, status: true, commercialType: { select: { prefix: true } } },
      },
    },
  });

  const types = await listCommercialTypes(true, "DEAL");

  return NextResponse.json({
    types,
    deals: deals.map((d) => ({
      id: d.id,
      commercialId: d.commercialId,
      commercialTypeId: d.commercialTypeId,
      typePrefix: d.commercialType?.prefix ?? null,
      typeName: d.commercialType?.name ?? null,
      recordTypeLabel: d.commercialType ? typeLabel(d.commercialType) : d.recordType,
      parentDealId: d.parentDealId,
      parent: d.parentDeal,
      children: d.childDeals.map((c) => ({
        id: c.id,
        commercialId: c.commercialId,
        title: c.title,
        status: c.status,
        typePrefix: c.commercialType?.prefix ?? null,
      })),
      title: d.title,
      direction: d.direction,
      status: d.status,
      statusLabel: dealStatusLabel(d.status, d.direction),
      vendorEmail: d.vendorEmail,
      vendorName: d.vendorName,
      template: d.fileTemplate?.name ?? null,
      rulePack: d.rulePack?.name ?? null,
      updatedAt: d.updatedAt,
    })),
    /** Deals that can serve as parents (all non-leaf candidates) */
    parentCandidates: deals.map((d) => ({
      id: d.id,
      commercialId: d.commercialId,
      title: d.title,
      direction: d.direction,
      commercialTypeId: d.commercialTypeId,
      typePrefix: d.commercialType?.prefix ?? null,
      vendorEmail: d.vendorEmail,
      vendorName: d.vendorName,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "EDITOR")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    title?: string;
    direction?: string;
    commercialTypeId?: string;
    parentDealId?: string;
    vendorEmail?: string;
    vendorName?: string;
    fileTemplateId?: string;
    documentId?: string;
    rulePackId?: string;
    message?: string;
  };

  if (!body.commercialTypeId) {
    return NextResponse.json({ error: "commercialTypeId required" }, { status: 400 });
  }

  const commercialType = await getCommercialType(body.commercialTypeId);
  if (!commercialType || !commercialType.active) {
    return NextResponse.json({ error: "commercial type not found" }, { status: 404 });
  }

  const direction: DealDirection = body.direction === "ORG_BUYING" ? "ORG_BUYING" : "ORG_SELLING";
  if (commercialType.direction !== direction) {
    return NextResponse.json({ error: "type direction does not match" }, { status: 400 });
  }

  let parentDealId: string | null = body.parentDealId?.trim() || null;

  if (commercialType.isRoot && parentDealId) {
    return NextResponse.json({ error: "master types cannot have a parent" }, { status: 400 });
  }

  let vendorEmail = body.vendorEmail?.trim() ?? "";
  let vendorName = body.vendorName?.trim() || null;

  if (parentDealId) {
    const check = await validateParentForType(parentDealId, body.commercialTypeId, "DEAL");
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    if (!vendorEmail) vendorEmail = check.parent.vendorEmail ?? "";
    if (!vendorName) vendorName = check.parent.vendorName ?? null;
  }

  if (!vendorEmail) return NextResponse.json({ error: "counterparty email required" }, { status: 400 });

  let documentId = body.documentId;
  if (body.fileTemplateId) {
    const tpl = await prisma.fileTemplate.findUnique({ where: { id: body.fileTemplateId } });
    if (!tpl) return NextResponse.json({ error: "template not found" }, { status: 404 });
    documentId = await copyDocumentFromTemplate(
      tpl.documentId,
      body.title?.trim() || tpl.name,
      session.user.id,
      `from template ${tpl.name}`,
    );
  } else if (!documentId) {
    documentId = await createPlaceholderDocument(
      body.title?.trim() || "New deal",
      session.user.id,
      "blank placeholder — vendor upload or linked contract expected",
    );
  }

  let rulePackId = body.rulePackId?.trim() || null;
  if (!rulePackId) {
    const defaultPack = await prisma.complianceRulePack.findFirst({
      where: { active: true, direction },
      orderBy: { createdAt: "desc" },
    });
    rulePackId = defaultPack?.id ?? null;
  }

  const commercialId = await allocateCommercialId(commercialType.prefix);
  const recordType = legacyRecordType(commercialType);

  const deal = await prisma.deal.create({
    data: {
      commercialId,
      commercialTypeId: body.commercialTypeId,
      recordType,
      parentDealId,
      title: body.title?.trim() || "New deal",
      direction,
      documentId,
      ownerId: session.user.id,
      vendorEmail,
      vendorName,
      vendorAccessToken: vendorToken(),
      fileTemplateId: body.fileTemplateId || null,
      rulePackId: rulePackId,
      message: body.message ?? null,
    },
  });

  await recordAudit({
    action: "deal.create",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DEAL",
    resourceId: deal.id,
    metadata: {
      commercialId,
      typePrefix: commercialType.prefix,
      direction,
      vendorEmail: deal.vendorEmail,
      parentDealId,
    },
  });

  return NextResponse.json({ id: deal.id, commercialId: deal.commercialId });
}
