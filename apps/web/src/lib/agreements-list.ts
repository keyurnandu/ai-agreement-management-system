import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import type { DealDirection } from "@/lib/commercial-types";

export async function listAgreementsForDirection(
  direction: DealDirection,
  user: { id: string; role: string },
) {
  const dealLinks = await prisma.deal.findMany({
    where: { direction, agreementId: { not: null } },
    select: { agreementId: true },
  });
  const ids = [...new Set(dealLinks.map((d) => d.agreementId).filter(Boolean))] as string[];
  if (ids.length === 0) return [];

  const where = roleAtLeast(user.role, "MANAGER")
    ? { id: { in: ids } }
    : {
        id: { in: ids },
        OR: [{ ownerId: user.id }, { recipients: { some: { userId: user.id } } }],
      };

  return prisma.agreement.findMany({
    where,
    include: {
      document: { select: { id: true, title: true } },
      recipients: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listExtractionDocumentsForDirection(
  direction: DealDirection,
  user: { id: string; role: string },
) {
  const ags = await listAgreementsForDirection(direction, user);
  const withDoc = ags.filter((a) => a.document);
  const agIds = withDoc.map((a) => a.id);
  const deals = agIds.length
    ? await prisma.deal.findMany({ where: { agreementId: { in: agIds } }, select: { id: true, agreementId: true } })
    : [];
  const dealByAg = new Map(deals.map((d) => [d.agreementId as string, d.id]));
  return withDoc.map((a) => ({
    agreementId: a.id,
    agreementTitle: a.title,
    agreementStatus: a.status,
    documentId: a.document!.id,
    documentTitle: a.document!.title,
    dealId: dealByAg.get(a.id) ?? null,
    direction,
  }));
}
