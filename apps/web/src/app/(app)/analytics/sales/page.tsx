import Link from "next/link";
import { DirectionTabs } from "@/components/DirectionTabs";
import { PortfolioDashboard } from "@/components/PortfolioDashboard";

export const dynamic = "force-dynamic";

export default function SalesAnalyticsPage() {
  return (
    <div className="container container-record">
      <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
        ← dashboard
      </Link>
      <div className="page-header" style={{ marginTop: 6 }}>
        <div className="page-header-main">
          <h1 style={{ marginBottom: 4 }}>Analytics</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            Portfolio view — counterparty, term dates, and contract value from deals, contracts, and extracted attributes.
          </p>
        </div>
      </div>

      <DirectionTabs
        activeId="sales"
        tabs={[
          { id: "sales", label: "Sales", href: "/analytics/sales", direction: "ORG_SELLING" },
          { id: "procurement", label: "Procurement", href: "/analytics/procurement", direction: "ORG_BUYING" },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        <PortfolioDashboard direction="ORG_SELLING" />
      </div>
    </div>
  );
}
