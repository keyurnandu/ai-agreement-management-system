import { prisma } from "@/lib/db";

/** Renumber contract clauses sequentially starting at 1. */
export async function renumberContractClauses(contractId: string): Promise<void> {
  const clauses = await prisma.contractClause.findMany({
    where: { contractId },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
  await Promise.all(
    clauses.map((c, i) =>
      c.order === i + 1
        ? Promise.resolve()
        : prisma.contractClause.update({ where: { id: c.id }, data: { order: i + 1 } }),
    ),
  );
}
