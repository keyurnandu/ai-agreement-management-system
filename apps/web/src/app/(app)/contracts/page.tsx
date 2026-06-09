import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--muted)",
  GENERATED: "var(--green)",
  SENT: "var(--accent)",
};

export default async function ContractsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const { id: uid, role } = session.user;

  const where = roleAtLeast(role, "MANAGER") ? {} : { createdById: uid };
  const rows = await prisma.contract.findMany({
    where,
    include: { template: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 20 }}>
        <div>
          <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
            ← dashboard
          </Link>
          <h1 style={{ marginTop: 6 }}>Contracts</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            Author structured contracts from templates — then generate a PDF and send for signature.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/clauses" className="btn secondary">
            Clause library
          </Link>
          <Link href="/templates" className="btn secondary">
            Templates
          </Link>
          <Link href="/contracts/new" className="btn">
            New contract
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p className="muted">
            No contracts yet. Click <strong>New contract</strong> to author one from a template.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                <th style={{ padding: "12px 16px" }}>Title</th>
                <th style={{ padding: "12px 16px" }}>Template</th>
                <th style={{ padding: "12px 16px" }}>Status</th>
                <th style={{ padding: "12px 16px" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <Link href={`/contracts/${c.id}`}>{c.title}</Link>
                  </td>
                  <td style={{ padding: "12px 16px" }} className="muted">
                    {c.template?.name ?? "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ color: STATUS_COLOR[c.status] ?? "var(--muted)" }}>{c.status}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }} className="muted">
                    {c.updatedAt.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
