import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { canAccessDocument } from "@/lib/documents";
import { PdfViewer } from "@/components/PdfViewer";
import { DocumentTools } from "@/components/DocumentTools";
import { PrepareForSignature } from "@/components/PrepareForSignature";
import { AttributesPanel } from "@/components/AttributesPanel";
import { InsightsPanel } from "@/components/InsightsPanel";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  const current = doc.versions[0];
  const canEdit = await canAccessDocument(actor, id, "EDIT");
  const canComment = await canAccessDocument(actor, id, "COMMENT");
  const canManage = await canAccessDocument(actor, id, "MANAGE");
  const fileUrl = current ? await storage().getSignedUrl(current.storageKey) : null;

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 16 }}>
        <div>
          <Link href="/documents" className="muted" style={{ fontSize: 13 }}>
            ← documents
          </Link>
          <h1 style={{ marginTop: 6 }}>{doc.title}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {doc.owner.email} · {current?.pageCount ?? 0} pages · v{current?.version ?? 1}
            {canEdit ? "" : " · read-only"}
          </p>
        </div>
        {canManage && current ? <PrepareForSignature documentId={doc.id} /> : null}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 280px", gap: 16, alignItems: "start" }}>
        {current ? (
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
            <p className="muted">No version available.</p>
          </div>
        )}

        <div className="grid" style={{ gap: 16 }}>
          <AttributesPanel documentId={doc.id} canEdit={canEdit} />
          <DocumentTools documentId={doc.id} canEdit={canEdit} />
          <div className="card">
            <h2>Version history</h2>
            <div className="grid" style={{ gap: 10 }}>
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
          </div>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <InsightsPanel documentId={doc.id} versions={doc.versions.map((v) => v.version)} />
      </div>
    </div>
  );
}
