import { prisma } from "@/lib/db";

/** Deal commercial type key → contract domain type key (same SMCW/SOR IDs, different domain). */
export const DEAL_TO_CONTRACT_TYPE_KEY: Record<string, string> = {
  smcw: "csmcw",
  scw: "cscw",
  sor: "csor",
  sam: "csam",
  pmcw: "cpmcw",
  pcw: "cpcw",
  por: "cpor",
  pam: "cpam",
};

export async function findContractForDeal(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, contractId: true, commercialId: true },
  });
  if (!deal) return null;

  if (deal.contractId) {
    const byFk = await prisma.contract.findUnique({ where: { id: deal.contractId } });
    if (byFk) return byFk;
  }

  if (deal.commercialId) {
    const byId = await prisma.contract.findFirst({
      where: {
        OR: [{ commercialId: deal.commercialId }, { dealId: deal.id }],
      },
    });
    if (byId) return byId;
  }

  return prisma.contract.findFirst({ where: { dealId: deal.id } });
}

export async function findDealForContract(contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, dealId: true, commercialId: true },
  });
  if (!contract) return null;

  if (contract.dealId) {
    const byFk = await prisma.deal.findUnique({ where: { id: contract.dealId } });
    if (byFk) return byFk;
  }

  if (contract.commercialId) {
    const byId = await prisma.deal.findFirst({
      where: {
        OR: [{ commercialId: contract.commercialId }, { contractId: contract.id }],
      },
    });
    if (byId) return byId;
  }

  return prisma.deal.findFirst({ where: { contractId: contract.id } });
}

/** Bidirectional link + shared commercialId. Replaces any prior link on either side. */
export async function linkDealAndContract(dealId: string, contractId: string) {
  const [deal, contract] = await Promise.all([
    prisma.deal.findUnique({ where: { id: dealId }, select: { commercialId: true, contractId: true } }),
    prisma.contract.findUnique({ where: { id: contractId }, select: { commercialId: true, dealId: true } }),
  ]);
  if (!deal || !contract) throw new Error("deal or contract not found");

  const sharedId = deal.commercialId ?? contract.commercialId;

  if (deal.contractId && deal.contractId !== contractId) {
    await prisma.contract.update({ where: { id: deal.contractId }, data: { dealId: null } });
  }
  if (contract.dealId && contract.dealId !== dealId) {
    await prisma.deal.update({ where: { id: contract.dealId }, data: { contractId: null } });
  }

  await prisma.$transaction([
    prisma.deal.update({
      where: { id: dealId },
      data: { contractId, ...(sharedId ? { commercialId: sharedId } : {}) },
    }),
    prisma.contract.update({
      where: { id: contractId },
      data: { dealId, ...(sharedId ? { commercialId: sharedId } : {}) },
    }),
  ]);
}

/** After creating a contract, link to a deal with the same commercialId if unlinked. */
export async function autoLinkContractByCommercialId(contractId: string, commercialId: string | null) {
  if (!commercialId) return;
  const deal = await prisma.deal.findFirst({
    where: { commercialId, contractId: null },
  });
  if (deal) await linkDealAndContract(deal.id, contractId);
}
