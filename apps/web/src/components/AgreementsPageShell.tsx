import Link from "next/link";
import { DirectionTabs } from "@/components/DirectionTabs";
import type { ReactNode } from "react";

export { AgreementsTable } from "@/components/AgreementsTable";

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
