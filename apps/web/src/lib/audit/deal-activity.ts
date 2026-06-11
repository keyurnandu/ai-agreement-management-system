import { prisma } from "@/lib/db";
import { auditActionLabel, auditEventDetail } from "@/lib/audit/labels";

export type DealActivityRow = {
  id: string;
  at: string;
  action: string;
  label: string;
  detail: string | null;
  actorEmail: string | null;
  actorName: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
};

export async function getDealActivity(dealId: string, limit = 100): Promise<DealActivityRow[]> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { documentId: true, contractId: true, agreementId: true },
  });
  if (!deal) return [];

  const or: { resourceType: string; resourceId: string }[] = [{ resourceType: "DEAL", resourceId: dealId }];
  if (deal.documentId) or.push({ resourceType: "DOCUMENT", resourceId: deal.documentId });
  if (deal.contractId) or.push({ resourceType: "CONTRACT", resourceId: deal.contractId });
  if (deal.agreementId) or.push({ resourceType: "AGREEMENT", resourceId: deal.agreementId });

  const rows = await prisma.auditEvent.findMany({
    where: { OR: or },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { name: true, email: true } } },
  });

  return rows.map((e) => {
    const metadata = (e.metadata as Record<string, unknown> | null) ?? null;
    return {
      id: e.id,
      at: e.createdAt.toISOString(),
      action: e.action,
      label: auditActionLabel(e.action),
      detail: auditEventDetail(e.action, metadata),
      actorEmail: e.actorEmail ?? e.actor?.email ?? null,
      actorName: e.actor?.name ?? null,
      ip: e.ip,
      userAgent: e.userAgent,
      metadata,
    };
  });
}
