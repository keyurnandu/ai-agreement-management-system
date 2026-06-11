import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { canAccessDocument } from "@/lib/documents";
import { getRecordContext } from "@/lib/record-context";
import { resolveBack } from "@/lib/record-nav";
import { PdfViewer } from "@/components/PdfViewer";
import { RecordWorkspace } from "@/components/RecordWorkspace";
import { DealNegotiationGrid, DealToolbar, DealWorkflowExtras } from "@/components/DealPanel";
import { PublishContractPdfButton } from "@/components/PublishContractPdfButton";
import { isPlaceholderDocument } from "@/lib/contract-pdf";

export const dynamic = "force-dynamic";

export default async function DealPage({
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

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      commercialId: true,
      documentId: true,
      contractId: true,
      direction: true,
      status: true,
      vendorEmail: true,
      vendorName: true,
      commercialType: { select: { key: true } },
    },
  });
  if (!deal) notFound();

  const actor = { id: session.user.id, role: session.user.role };
  const { tabs, documentId, documentTitle } = await getRecordContext({
    dealId: id,
    contractId: deal.contractId ?? undefined,
    active: "deal",
    returnTo: `/deals/${id}`,
  });

  const doc = documentId
    ? await prisma.document.findUnique({
        where: { id: documentId },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
      })
    : null;

  const current = doc?.versions[0];
  const canViewDoc = documentId ? await canAccessDocument(actor, documentId, "VIEW") : false;
  const canEdit = documentId ? await canAccessDocument(actor, documentId, "EDIT") : false;
  const canComment = documentId ? await canAccessDocument(actor, documentId, "COMMENT") : false;
  const canManage = documentId ? await canAccessDocument(actor, documentId, "MANAGE") : false;
  const fileUrl = current ? await storage().getSignedUrl(current.storageKey) : null;
  const needsPublish =
    !!deal.contractId && documentId ? await isPlaceholderDocument(documentId) : false;

  const dealsListHref = deal.direction === "ORG_BUYING" ? "/deals/procurement" : "/deals/sales";
  const back = resolveBack(from, { href: dealsListHref, label: "deals" });
  const direction = deal.direction as "ORG_SELLING" | "ORG_BUYING";

  const pdfBlock =
    canViewDoc && current ? (
      <PdfViewer
        documentId={documentId!}
        pageCount={current.pageCount}
        canEdit={canEdit}
        canComment={canComment}
        canManage={canManage}
        currentUserId={actor.id}
        fileUrl={fileUrl}
      />
    ) : (
      <div className="card">
        <p className="muted">No document attached to this deal yet.</p>
      </div>
    );

  return (
    <div className="container container-record">
      <RecordWorkspace
        active="deal"
        tabs={tabs}
        backHref={back.href}
        backLabel={back.label}
        title={deal.commercialId ? `${deal.commercialId} — ${deal.title}` : deal.title}
        subtitle={`${deal.vendorName ?? deal.vendorEmail}`}
        toolbar={<DealToolbar dealId={id} />}
        showAttributes={false}
        documentId={canViewDoc ? documentId : null}
        documentTitle={documentTitle}
        canEditAttributes={canEdit}
        main={
          <div className="deal-page-stack">
            <PublishContractPdfButton
              dealId={id}
              contractId={deal.contractId}
              needsPublish={needsPublish}
            />
            {pdfBlock}
            <DealNegotiationGrid
              dealId={id}
              contractId={deal.contractId}
              direction={direction}
              commercialId={deal.commercialId}
              commercialTypeKey={deal.commercialType?.key ?? null}
              status={deal.status}
              showIssueForm
            />
          </div>
        }
        below={<DealWorkflowExtras dealId={id} />}
      />
    </div>
  );
}
