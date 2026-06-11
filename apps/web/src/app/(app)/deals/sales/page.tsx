import Link from "next/link";
import { DealsList } from "@/components/DealsList";
import { DirectionTabs } from "@/components/DirectionTabs";
import { VendorWorkflowGuide } from "@/components/VendorWorkflowGuide";

export const dynamic = "force-dynamic";

export default function SalesDealsPage() {
  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Deals</h1>
          <p className="muted" style={{ fontSize: 14 }}>
            Live workflow with customers — portal, review, approve, sign. Same IDs as contracts (SMCW-1 = SMCW-1).
          </p>
        </div>
        <Link className="btn" href="/deals/new?direction=ORG_SELLING&from=/deals/sales">
          New sales deal
        </Link>
      </div>

      <DirectionTabs
        activeId="sales"
        tabs={[
          { id: "sales", label: "Sales", href: "/deals/sales", direction: "ORG_SELLING" },
          { id: "procurement", label: "Procurement", href: "/deals/procurement", direction: "ORG_BUYING" },
        ]}
      />

      <div style={{ marginTop: 16 }}>
        <VendorWorkflowGuide direction="ORG_SELLING" />
      </div>

      <div style={{ marginTop: 16 }}>
        <DealsList direction="ORG_SELLING" />
      </div>
    </div>
  );
}
