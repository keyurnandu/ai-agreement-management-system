import { prisma } from "@/lib/db";

export type DealDirection = "ORG_SELLING" | "ORG_BUYING";

export type CommercialDomain = "DEAL" | "CONTRACT" | "DOCUMENT";

export type CommercialTypeDto = {
  id: string;
  key: string;
  name: string;
  prefix: string;
  direction: DealDirection;
  domain: CommercialDomain;
  isRoot: boolean;
  description: string | null;
  system: boolean;
  sortOrder: number;
  allowedParentIds: string[];
  allowedChildIds: string[];
  active: boolean;
};

export async function listCommercialTypes(activeOnly = true, domain?: CommercialDomain) {
  const types = await prisma.commercialRecordType.findMany({
    where: {
      ...(activeOnly ? { active: true } : {}),
      ...(domain ? { domain } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      // parentLinks: this type is the parent in the link → lists child type ids
      parentLinks: { select: { childTypeId: true } },
      // childLinks: this type is the child in the link → lists parent type ids
      childLinks: { select: { parentTypeId: true } },
    },
  });

  return types.map((t) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    prefix: t.prefix,
    direction: t.direction as DealDirection,
    domain: t.domain as CommercialDomain,
    isRoot: t.isRoot,
    description: t.description,
    system: t.system,
    sortOrder: t.sortOrder,
    allowedParentIds: t.childLinks.map((l) => l.parentTypeId),
    allowedChildIds: t.parentLinks.map((l) => l.childTypeId),
    active: t.active,
  })) satisfies CommercialTypeDto[];
}

export async function getCommercialType(id: string) {
  const types = await listCommercialTypes(false);
  return types.find((t) => t.id === id) ?? null;
}

export async function getCommercialTypeByKey(key: string) {
  const row = await prisma.commercialRecordType.findUnique({ where: { key } });
  if (!row) return null;
  return (await listCommercialTypes(false)).find((t) => t.id === row.id) ?? null;
}

/** Allocate the next global ID for a prefix, e.g. SMCW-1. */
export async function allocateCommercialId(prefix: string): Promise<string> {
  const p = prefix.toUpperCase();
  return prisma.$transaction(async (tx) => {
    let seq = await tx.commercialIdSequence.findUnique({ where: { prefix: p } });
    if (!seq) {
      seq = await tx.commercialIdSequence.create({ data: { prefix: p, nextVal: 1 } });
    }
    const commercialId = `${p}-${seq.nextVal}`;
    await tx.commercialIdSequence.update({
      where: { prefix: p },
      data: { nextVal: seq.nextVal + 1 },
    });
    return commercialId;
  });
}

export async function validateParentForType(
  parentId: string,
  childTypeId: string,
  domain: CommercialDomain = "DEAL",
): Promise<
  | { ok: true; parent: { vendorEmail?: string; vendorName?: string | null; direction: DealDirection; title: string } }
  | { ok: false; error: string }
> {
  const childType = await getCommercialType(childTypeId);
  if (!childType) return { ok: false, error: "record type not found" };
  if (childType.domain !== domain) {
    return { ok: false, error: "type domain mismatch" };
  }

  if (domain === "DEAL") {
    const parent = await prisma.deal.findUnique({
      where: { id: parentId },
      include: { commercialType: true },
    });
    if (!parent) return { ok: false, error: "parent record not found" };
    if (!parent.commercialTypeId || !parent.commercialType) {
      return { ok: false, error: "parent has no commercial type" };
    }
    const linkOk = await prisma.commercialTypeLink.findFirst({
      where: { parentTypeId: parent.commercialTypeId, childTypeId },
    });
    if (!linkOk) {
      return {
        ok: false,
        error: `cannot attach under ${parent.commercialType.prefix} — link not defined in hierarchy settings`,
      };
    }
    if (parent.direction !== childType.direction) {
      return { ok: false, error: "parent must be same direction (sales vs procurement)" };
    }
    return {
      ok: true,
      parent: {
        vendorEmail: parent.vendorEmail,
        vendorName: parent.vendorName,
        direction: parent.direction as DealDirection,
        title: parent.title,
      },
    };
  }

  if (domain === "CONTRACT") {
    const parent = await prisma.contract.findUnique({
      where: { id: parentId },
      include: { commercialType: true },
    });
    if (!parent?.commercialTypeId || !parent.commercialType) {
      return { ok: false, error: "parent contract not found or untyped" };
    }
    const linkOk = await prisma.commercialTypeLink.findFirst({
      where: { parentTypeId: parent.commercialTypeId, childTypeId },
    });
    if (!linkOk) {
      return { ok: false, error: `cannot attach under ${parent.commercialType.prefix}` };
    }
    return {
      ok: true,
      parent: { direction: childType.direction, title: parent.title },
    };
  }

  // DOCUMENT
  const parent = await prisma.document.findUnique({
    where: { id: parentId },
    include: { commercialType: true },
  });
  if (!parent?.commercialTypeId || !parent.commercialType) {
    return { ok: false, error: "parent collection not found" };
  }
  const linkOk = await prisma.commercialTypeLink.findFirst({
    where: { parentTypeId: parent.commercialTypeId, childTypeId },
  });
  if (!linkOk) {
    return { ok: false, error: `cannot attach under ${parent.commercialType.prefix}` };
  }
  return {
    ok: true,
    parent: { direction: childType.direction, title: parent.title },
  };
}

export async function typeSupportsParent(typeId: string): Promise<boolean> {
  const t = await getCommercialType(typeId);
  if (!t) return false;
  return t.allowedParentIds.length > 0;
}

/** @deprecated Parent is optional when supported; use typeSupportsParent. */
export async function typeRequiresParent(typeId: string): Promise<boolean> {
  return typeSupportsParent(typeId);
}

export function typeLabel(type: { prefix: string; name: string }): string {
  return `${type.name} (${type.prefix})`;
}

/** Legacy mapping for recordType field on Deal */
export function legacyRecordType(type: { isRoot: boolean }): "MASTER_CONTRACT" | "ORDER_FORM" {
  return type.isRoot ? "MASTER_CONTRACT" : "ORDER_FORM";
}
