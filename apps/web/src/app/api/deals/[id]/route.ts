import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { canAccessDeal, dealStatusLabel } from "@/lib/procurement";
import { deleteDealHard } from "@/lib/delete-resources";
import { listCommercialTypes, typeLabel } from "@/lib/commercial-types";
import { env } from "@/env";
import { parseStoredDiff } from "@/lib/clause-diff";

export const dynamic = "force-dynamic";

function dealDiff(deal: {
  lastDiffFromVersion: number | null;
  lastDiffToVersion: number | null;
  lastDiffSummary: string | null;
  lastDiffLines: unknown;
}) {
  if (!deal.lastDiffLines) return null;
  const parsed = parseStoredDiff(deal.lastDiffLines);
  if (!parsed.clauseChanges.length && !parsed.lines.length) return null;
  return {
    fromVersion: deal.lastDiffFromVersion,
    toVersion: deal.lastDiffToVersion,
    summary: deal.lastDiffSummary,
    lines: deal.lastDiffLines,
    clauseChanges: parsed.clauseChanges,
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      fileTemplate: true,
      rulePack: true,
      issues: { orderBy: { createdAt: "desc" } },
      commercialType: true,
      parentDeal: {
        select: {
          id: true,
          commercialId: true,
          title: true,
          commercialType: { select: { prefix: true, name: true } },
        },
      },
      childDeals: {
        select: {
          id: true,
          commercialId: true,
          title: true,
          status: true,
          commercialType: { select: { prefix: true, name: true } },
        },
        orderBy: { commercialId: "asc" },
      },
    },
  });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const types = await listCommercialTypes(true, "DEAL");
  const allowedChildTypes = types.filter(
    (t) =>
      deal.commercialTypeId &&
      t.allowedParentIds.includes(deal.commercialTypeId) &&
      !t.isRoot &&
      t.domain === "DEAL",
  );

  const base = env.APP_BASE_URL.replace(/\/$/, "");
  return NextResponse.json({
    deal: {
      ...deal,
      statusLabel: dealStatusLabel(deal.status, deal.direction),
      recordTypeLabel: deal.commercialType ? typeLabel(deal.commercialType) : deal.recordType,
      typePrefix: deal.commercialType?.prefix ?? null,
      allowedChildTypes: allowedChildTypes.map((t) => ({ id: t.id, prefix: t.prefix, name: t.name })),
      vendorPortalUrl: `${base}/vendor/${deal.vendorAccessToken}`,
      signingUrl: deal.agreementId ? `${base}/agreements/${deal.agreementId}` : null,
      lastDiff: dealDiff(deal),
    },
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await deleteDealHard(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "cannot delete deal";
    const status = msg.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: msg }, { status });
  }

  await recordAudit({
    action: "deal.delete",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DEAL",
    resourceId: id,
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ ok: true });
}
