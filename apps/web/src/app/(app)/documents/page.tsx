import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { UploadButton } from "@/components/UploadButton";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const { id: uid, role } = session.user;

  const where = roleAtLeast(role, "MANAGER")
    ? {}
    : { OR: [{ ownerId: uid }, { permissions: { some: { userId: uid } } }] };

  const docs = await prisma.document.findMany({
    where,
    include: {
      owner: { select: { email: true } },
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 20 }}>
        <div>
          <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
            ← dashboard
          </Link>
          <h1 style={{ marginTop: 6 }}>Documents</h1>
        </div>
        <UploadButton />
      </div>

      {docs.length === 0 ? (
        <div className="card">
          <p className="muted">No documents yet. Upload a PDF to get started.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                <th style={{ padding: "12px 16px" }}>Title</th>
                <th style={{ padding: "12px 16px" }}>Owner</th>
                <th style={{ padding: "12px 16px" }}>Pages</th>
                <th style={{ padding: "12px 16px" }}>Version</th>
                <th style={{ padding: "12px 16px" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const v = d.versions[0];
                return (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/documents/${d.id}`}>{d.title}</Link>
                    </td>
                    <td style={{ padding: "12px 16px" }} className="muted">
                      {d.owner.email}
                    </td>
                    <td style={{ padding: "12px 16px" }} className="muted">
                      {v?.pageCount ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }} className="muted">
                      v{v?.version ?? 1}
                    </td>
                    <td style={{ padding: "12px 16px" }} className="muted">
                      {d.updatedAt.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
