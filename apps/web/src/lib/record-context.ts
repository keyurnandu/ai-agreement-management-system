import { prisma } from "@/lib/db";
import { findContractForDeal, findDealForContract } from "@/lib/commercial-link";
import { withReturnTo } from "@/lib/record-nav";

export type ContextTab = {
  kind: "document" | "contract" | "deal";
  id: string;
  label: string;
  href: string;
  commercialId?: string | null;
  badge?: number;
};

/** Resolve linked document / contract / deal for the context tab bar. */
export async function getRecordContext(opts: {
  documentId?: string;
  contractId?: string;
  dealId?: string;
  active: ContextTab["kind"];
  returnTo?: string;
}): Promise<{ tabs: ContextTab[]; documentId: string | null; documentTitle: string | null }> {
  let documentId = opts.documentId ?? null;
  let contractId = opts.contractId ?? null;
  let dealId = opts.dealId ?? null;

  if (dealId) {
    const linked = await findContractForDeal(dealId);
    if (linked) contractId = linked.id;
    if (!documentId) {
      const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { documentId: true } });
      documentId = deal?.documentId ?? null;
    }
  }

  if (contractId) {
    const linked = await findDealForContract(contractId);
    if (linked) dealId = linked.id;
    if (!documentId) {
      const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { documentId: true } });
      documentId = contract?.documentId ?? null;
    }
  }

  if (documentId && !dealId) {
    const deal = await prisma.deal.findFirst({ where: { documentId }, select: { id: true } });
    if (deal) dealId = deal.id;
  }
  if (documentId && !contractId && dealId) {
    const linked = await findContractForDeal(dealId);
    if (linked) contractId = linked.id;
  }

  const doc = documentId
    ? await prisma.document.findUnique({ where: { id: documentId }, select: { id: true, title: true, commercialId: true } })
    : null;

  const tabs: ContextTab[] = [];

  const returnTo = opts.returnTo;

  if (doc) {
    tabs.push({
      kind: "document",
      id: doc.id,
      label: doc.commercialId ? `Document · ${doc.commercialId}` : "Document",
      href: withReturnTo(`/documents/${doc.id}`, returnTo),
      commercialId: doc.commercialId,
    });
  }

  if (contractId) {
    const c = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { title: true, commercialId: true, dealId: true },
    });
    if (c) {
      let openIssues = 0;
      if (c.dealId) {
        openIssues = await prisma.reviewIssue.count({ where: { dealId: c.dealId, status: "OPEN" } });
      }
      tabs.push({
        kind: "contract",
        id: contractId,
        label: c.commercialId ? `Contract · ${c.commercialId}` : "Contract",
        href: withReturnTo(`/contracts/${contractId}`, returnTo),
        commercialId: c.commercialId,
        badge: openIssues > 0 ? openIssues : undefined,
      });
    }
  }

  if (dealId) {
    const d = await prisma.deal.findUnique({
      where: { id: dealId },
      select: {
        title: true,
        commercialId: true,
        _count: { select: { issues: { where: { status: "OPEN" } } } },
      },
    });
    if (d) {
      const openIssues = d._count.issues;
      tabs.push({
        kind: "deal",
        id: dealId,
        label: d.commercialId ? `Deal · ${d.commercialId}` : "Deal",
        href: withReturnTo(`/deals/${dealId}`, returnTo),
        commercialId: d.commercialId,
        badge: openIssues > 0 ? openIssues : undefined,
      });
    }
  }

  return {
    tabs,
    documentId: doc?.id ?? documentId,
    documentTitle: doc?.title ?? null,
  };
}
