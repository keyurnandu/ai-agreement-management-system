import Link from "next/link";
import { DirectionTabs } from "@/components/DirectionTabs";
import type { ReactNode } from "react";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--muted)",
  SENT: "var(--accent)",
  IN_PROGRESS: "var(--amber)",
  COMPLETED: "var(--green)",
  DECLINED: "var(--red)",
  VOIDED: "var(--red)",
  EXPIRED: "var(--red)",
};

type AgreementRow = {
  id: string;
  title: string;
  status: string;
  routingType: string;
  updatedAt: Date;
  signed: number;
  signers: number;
};

export function AgreementsTable({ rows }: { rows: AgreementRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          No agreements in this cycle yet. Approve a deal and use <strong>Start signing</strong> on the deal page.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Signed</th>
            <th>Routing</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>
                <Link href={`/agreements/${a.id}`}>{a.title}</Link>
              </td>
              <td>
                <span style={{ color: STATUS_COLOR[a.status] ?? "var(--muted)" }}>{a.status}</span>
              </td>
              <td className="muted">
                {a.signed}/{a.signers}
              </td>
              <td className="muted">{a.routingType.toLowerCase()}</td>
              <td className="muted">{a.updatedAt.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgreementsPageShell({
  activeTab,
  title,
  subtitle,
  children,
  extraction,
}: {
  activeTab: "sales" | "procurement";
  title: string;
  subtitle: string;
  children: ReactNode;
  extraction: ReactNode;
}) {
  return (
    <div className="container">
      <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
        ← Home
      </Link>
      <h1 style={{ marginTop: 8, marginBottom: 4 }}>{title}</h1>
      <p className="muted" style={{ fontSize: 14, marginBottom: 16 }}>
        {subtitle}
      </p>

      <DirectionTabs
        activeId={activeTab}
        tabs={[
          { id: "sales", label: "Sales", href: "/agreements/sales", direction: "ORG_SELLING" },
          { id: "procurement", label: "Procurement", href: "/agreements/procurement", direction: "ORG_BUYING" },
        ]}
      />

      <div style={{ marginTop: 20 }}>{children}</div>
      {extraction}
    </div>
  );
}
