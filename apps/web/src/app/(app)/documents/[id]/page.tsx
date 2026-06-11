import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { canAccessDocument } from "@/lib/documents";
import { getRecordContext } from "@/lib/record-context";
import { resolveBack } from "@/lib/record-nav";
import { PdfViewer } from "@/components/PdfViewer";
import { DocumentToolsModal } from "@/components/DocumentToolsModal";
import { InsightsPanel } from "@/components/InsightsPanel";
import { RecordWorkspace } from "@/components/RecordWorkspace";
import { DocumentDeleteButton } from "@/components/DocumentDeleteButton";

export const dynamic = "force-dynamic";

export default async function DocumentPage({
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

  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDocument(actor, id, "VIEW"))) notFound();

  const doc = await prisma.document.findUnique({
    where: { id },
    include: {
      owner: { select: { email: true } },
      versions: { orderBy: { version: "desc" } },
    },
  });
  if (!doc) notFound();

  const { tabs, documentId, documentTitle } = await getRecordContext({
    documentId: id,
    active: "document",
    returnTo: `/documents/${id}`,
  });

  const current = doc.versions[0];
  const canEdit = await canAccessDocument(actor, id, "EDIT");
  const canComment = await canAccessDocument(actor, id, "COMMENT");
  const canManage = await canAccessDocument(actor, id, "MANAGE");
  const fileUrl = current ? await storage().getSignedUrl(current.storageKey) : null;
  const isPdf = doc.kind !== "COLLECTION" && !!current;

  const back = resolveBack(from, { href: "/documents", label: "documents" });

  return (
    <div className="container container-wide">
      <RecordWorkspace
        active="document"
        tabs={tabs}
        backHref={back.href}
        backLabel={back.label}
        title={doc.title}
        subtitle={
          <>
            {doc.owner.email} · {current?.pageCount ?? 0} pages · v{current?.version ?? 1}
            {canEdit ? "" : " · read-only"}
          </>
        }
        documentId={documentId}
        documentTitle={documentTitle}
        canEditAttributes={canEdit}
        actions={
          <>
            {isPdf ? <DocumentToolsModal documentId={doc.id} canEdit={canEdit} /> : null}
            {canManage ? <DocumentDeleteButton documentId={doc.id} title={doc.title} /> : null}
          </>
        }
        main={
          current ? (
            isPdf ? (
              <PdfViewer
                documentId={doc.id}
                pageCount={current.pageCount}
                canEdit={canEdit}
                canComment={canComment}
                canManage={canManage}
                currentUserId={actor.id}
                fileUrl={fileUrl}
              />
            ) : (
              <div className="card">
                <p className="muted">Collection folder — open a child PDF to view and annotate.</p>
              </div>
            )
          ) : (
            <div className="card">
              <p className="muted">No version available.</p>
            </div>
          )
        }
        below={
          <>
            <details className="card doc-details">
              <summary>Version history</summary>
              <div className="grid" style={{ gap: 10, marginTop: 12 }}>
                {doc.versions.map((v) => (
                  <div key={v.id} className="row" style={{ alignItems: "flex-start" }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>v{v.version}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {v.note ?? "—"}
                      </div>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {v.createdAt.toLocaleString()} · {(v.byteSize / 1024).toFixed(0)} KB · {v.pageCount}p
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>
            {isPdf ? (
              <details className="card doc-details">
                <summary>Advanced AI insights</summary>
                <div style={{ marginTop: 12 }}>
                  <InsightsPanel documentId={doc.id} versions={doc.versions.map((v) => v.version)} embedded />
                </div>
              </details>
            ) : null}
          </>
        }
      />
    </div>
  );
}
