import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";

export async function getDocumentDeleteBlockers(documentId: string): Promise<string | null> {
  const [agreement, dealCount, template, rulePack] = await Promise.all([
    prisma.agreement.findUnique({ where: { documentId }, select: { title: true, status: true } }),
    prisma.deal.count({ where: { documentId } }),
    prisma.fileTemplate.findFirst({ where: { documentId, active: true }, select: { name: true } }),
    prisma.complianceRulePack.findFirst({ where: { documentId, active: true }, select: { name: true } }),
  ]);

  if (agreement) {
    return `Document is linked to agreement "${agreement.title}" (${agreement.status}). Remove or void the agreement first.`;
  }
  if (dealCount > 0) {
    return `Document is used by ${dealCount} deal(s). Delete those deals first.`;
  }
  if (template) {
    return `Document is the master file for template "${template.name}". Remove the template first.`;
  }
  if (rulePack) {
    return `Document is the source file for rule pack "${rulePack.name}". Remove the rule pack first.`;
  }
  return null;
}

/** Permanently delete a document and its stored files. Throws if blocked. */
export async function deleteDocumentHard(documentId: string): Promise<void> {
  const blocker = await getDocumentDeleteBlockers(documentId);
  if (blocker) throw new Error(blocker);

  const childCount = await prisma.document.count({ where: { collectionParentId: documentId } });
  if (childCount > 0) {
    throw new Error(`Collection has ${childCount} child item(s). Remove or move them first.`);
  }

  const versions = await prisma.documentVersion.findMany({
    where: { documentId },
    select: { storageKey: true },
  });

  await prisma.attributeValue.deleteMany({ where: { documentId } });
  await prisma.document.delete({ where: { id: documentId } });

  for (const v of versions) {
    try {
      await storage().delete(v.storageKey);
    } catch {
      /* best-effort storage cleanup */
    }
  }
}

export async function softDeleteFileTemplate(id: string): Promise<void> {
  const tpl = await prisma.fileTemplate.findUnique({ where: { id } });
  if (!tpl) throw new Error("template not found");
  await prisma.fileTemplate.update({ where: { id }, data: { active: false } });
}

export async function softDeleteRulePack(id: string): Promise<void> {
  const pack = await prisma.complianceRulePack.findUnique({ where: { id } });
  if (!pack) throw new Error("rule pack not found");
  await prisma.complianceRulePack.update({ where: { id }, data: { active: false } });
}

export async function deleteDealHard(dealId: string): Promise<void> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error("deal not found");

  const childCount = await prisma.deal.count({ where: { parentDealId: dealId } });
  if (childCount > 0) {
    throw new Error(`Deal has ${childCount} attached order form(s). Delete or reassign them first.`);
  }

  if (deal.agreementId) {
    const ag = await prisma.agreement.findUnique({
      where: { id: deal.agreementId },
      select: { title: true, status: true },
    });
    if (ag && !["DRAFT", "VOIDED"].includes(ag.status)) {
      throw new Error(
        `Deal is linked to agreement "${ag.title}" (${ag.status}). Void the agreement before deleting this deal.`,
      );
    }
  }

  await prisma.deal.delete({ where: { id: dealId } });
}

export async function deleteAgreementHard(agreementId: string): Promise<void> {
  const ag = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!ag) throw new Error("agreement not found");
  if (!["DRAFT", "VOIDED", "DECLINED", "EXPIRED"].includes(ag.status)) {
    throw new Error(`Cannot delete agreement in ${ag.status} status.`);
  }
  await prisma.deal.updateMany({ where: { agreementId }, data: { agreementId: null } });
  await prisma.agreement.delete({ where: { id: agreementId } });
}

/** Permanently delete a contract (clauses cascade). Unlinks deals; does not delete documents. */
export async function deleteContractHard(contractId: string): Promise<void> {
  const c = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!c) throw new Error("contract not found");

  const childCount = await prisma.contract.count({ where: { parentContractId: contractId } });
  if (childCount > 0) {
    throw new Error(`Contract has ${childCount} child contract(s). Delete child contracts first.`);
  }

  await prisma.deal.updateMany({ where: { contractId }, data: { contractId: null } });
  await prisma.attributeValue.deleteMany({ where: { contractId } });
  await prisma.contract.delete({ where: { id: contractId } });
}
