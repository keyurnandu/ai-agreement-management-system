import Link from "next/link";
import { redirect } from "next/navigation";
import { NewContract } from "@/components/NewContract";
import { prisma } from "@/lib/db";
import { contractsListHref, resolveBack } from "@/lib/record-nav";

export const dynamic = "force-dynamic";

type Direction = "ORG_SELLING" | "ORG_BUYING";

function parseDirection(value: string | undefined): Direction | undefined {
  return value === "ORG_BUYING" || value === "ORG_SELLING" ? value : undefined;
}

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string; dealId?: string; direction?: string; from?: string }>;
}) {
  const { parentId, dealId, direction, from } = await searchParams;
  let dir = parseDirection(direction);

  if (!dir && dealId) {
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { direction: true },
    });
    dir = parseDirection(deal?.direction);
  }

  if (!dir && parentId) {
    const parent = await prisma.contract.findUnique({
      where: { id: parentId },
      select: { commercialType: { select: { direction: true } } },
    });
    dir = parseDirection(parent?.commercialType?.direction);
  }

  if (!dir) {
    redirect("/contracts/sales");
  }

  const listHref = contractsListHref(dir);
  const back = resolveBack(from, { href: listHref, label: "contracts" });
  const title = dir === "ORG_BUYING" ? "New procurement contract" : "New sales contract";

  return (
    <div className="container container-record">
      <Link href={back.href} className="muted" style={{ fontSize: 13 }}>
        ← {back.label}
      </Link>
      <h1 style={{ marginTop: 6, marginBottom: 18 }}>{title}</h1>
      {parentId ? (
        <p className="lead">Creating a child contract under the selected parent in the hierarchy.</p>
      ) : dealId ? (
        <p className="lead">Will link to deal and use the same commercial ID (e.g. SMCW-1).</p>
      ) : dir === "ORG_BUYING" ? (
        <p className="lead">Pick master (CPMCW), wrapper (CPCW), order (CPOR), or amendment (CPAM). Parent link is optional.</p>
      ) : (
        <p className="lead">Pick master (CSMCW), wrapper (CSCW), order (CSOR), or amendment (CSAM). Parent link is optional.</p>
      )}
      <NewContract parentId={parentId} dealId={dealId} direction={dir} />
    </div>
  );
}
