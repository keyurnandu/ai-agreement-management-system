import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--muted)",
  SENT: "var(--accent)",
  IN_PROGRESS: "var(--amber)",
  COMPLETED: "var(--green)",
  DECLINED: "var(--red)",
  VOIDED: "var(--red)",
  EXPIRED: "var(--red)",
};

export default async function AgreementsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const { id: uid, role } = session.user;

  const where = roleAtLeast(role, "MANAGER")
    ? {}
    : { OR: [{ ownerId: uid }, { recipients: { some: { userId: uid } } }] };

  const ags = await prisma.agreement.findMany({
    where,
    include: { recipients: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 20 }}>
        <div>
          <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
            ← dashboard
          </Link>
          <h1 style={{ marginTop: 6 }}>Agreements</h1>
        </div>
        <Link href="/documents" className="btn secondary">
          From a document →
        </Link>
      </div>

      {ags.length === 0 ? (
        <div className="card">
          <p className="muted">
            No agreements yet. Open a document and choose <strong>Prepare for signature</strong>.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                <th style={{ padding: "12px 16px" }}>Title</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }}>Signed</th>
                <th style={{ padding: "12px 16px" }}>Routing</th>
                <th style={{ padding: "12px 16px" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {ags.map((a) => {
                const signed = a.recipients.filter((r) => r.status === "SIGNED").length;
                const signers = a.recipients.filter((r) => r.role !== "CC").length;
                return (
                  <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/agreements/${a.id}`}>{a.title}</Link>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ color: STATUS_COLOR[a.status] ?? "var(--muted)" }}>{a.status}</span>
                    </td>
                    <td style={{ padding: "12px 16px" }} className="muted">
                      {signed}/{signers}
                    </td>
                    <td style={{ padding: "12px 16px" }} className="muted">
                      {a.routingType.toLowerCase()}
                    </td>
                    <td style={{ padding: "12px 16px" }} className="muted">
                      {a.updatedAt.toLocaleString()}
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
