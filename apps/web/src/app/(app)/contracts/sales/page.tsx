import Link from "next/link";
import { ContractsList } from "@/components/ContractsList";
import { ContractWorkflowGuide } from "@/components/ContractWorkflowGuide";
import { DirectionTabs } from "@/components/DirectionTabs";

export const dynamic = "force-dynamic";

export default function SalesContractsPage() {
  return (
    <div className="container container-record">
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ marginBottom: 4 }}>Contracts</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          Sales clause library — same IDs as deals (SMCW-1 = SMCW-1). Master → wrapper → order → amendment.
        </p>
      </div>

      <DirectionTabs
        activeId="sales"
        tabs={[
          { id: "sales", label: "Sales", href: "/contracts/sales", direction: "ORG_SELLING" },
          { id: "procurement", label: "Procurement", href: "/contracts/procurement", direction: "ORG_BUYING" },
        ]}
      />

      <div className="row" style={{ marginTop: 16, marginBottom: 16, justifyContent: "flex-start" }}>
        <Link className="btn" href="/contracts/new?direction=ORG_SELLING&from=/contracts/sales">
          New sales contract
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <ContractWorkflowGuide direction="ORG_SELLING" />
      </div>

      <ContractsList direction="ORG_SELLING" />
    </div>
  );
}
