import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { canAccessDocument } from "@/lib/documents";
import { getRecordContext } from "@/lib/record-context";
import { contractsListHref, isSafeReturnPath, resolveBack, withReturnTo } from "@/lib/record-nav";
import { RecordWorkspace } from "@/components/RecordWorkspace";
import { ContractClauses } from "@/components/ContractView";
import { DealIssuesPanel } from "@/components/DealIssuesPanel";

export const dynamic = "force-dynamic";

export default async function ContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const session = await auth();
  if (!session?.user) return null;

  const c = await prisma.contract.findUnique({
    where: { id },
    include: {
      template: { select: { name: true } },
      commercialType: { select: { direction: true } },
    },
  });
  if (!c) notFound();
  if (!(roleAtLeast(session.user.role, "MANAGER") || c.createdById === session.user.id)) notFound();

  const actor = { id: session.user.id, role: session.user.role };
  const listHref = contractsListHref(c.commercialType?.direction);
  const back = resolveBack(from, { href: listHref, label: "contracts" });
  const returnTo = from && isSafeReturnPath(from) ? from : listHref;
  const { tabs, documentId, documentTitle } = await getRecordContext({
    contractId: id,
    dealId: c.dealId ?? undefined,
    active: "contract",
    returnTo,
  });

  const canViewDoc = documentId ? await canAccessDocument(actor, documentId, "VIEW") : false;
  const canEdit = canViewDoc && documentId ? await canAccessDocument(actor, documentId, "EDIT") : false;
  const visibleDocId = canViewDoc ? documentId : null;

  return (
    <div className="container container-record">
      <RecordWorkspace
        active="contract"
        tabs={tabs}
        backHref={back.href}
        backLabel={back.label}
        title={c.commercialId ? `${c.commercialId} — ${c.title}` : c.title}
        subtitle={`${c.status} · from ${c.template?.name ?? "—"}`}
        showAttributes={false}
        documentId={visibleDocId}
        documentTitle={documentTitle}
        canEditAttributes={canEdit}
        actions={
          visibleDocId ? (
            <Link href={withReturnTo(`/documents/${visibleDocId}`, `/contracts/${id}`)} className="btn secondary">
              Document tab
            </Link>
          ) : null
        }
        main={
          c.dealId ? (
            <div className="negotiation-workspace has-contract contract-page-layout">
              <DealIssuesPanel dealId={c.dealId} variant="rail" />
              <div className="negotiation-center">
                <ContractClauses contractId={id} />
              </div>
            </div>
          ) : (
            <ContractClauses contractId={id} />
          )
        }
      />
    </div>
  );
}
