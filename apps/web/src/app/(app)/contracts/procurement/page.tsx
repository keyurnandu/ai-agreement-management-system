import Link from "next/link";
import { ContractsList } from "@/components/ContractsList";
import { ContractWorkflowGuide } from "@/components/ContractWorkflowGuide";
import { DirectionTabs } from "@/components/DirectionTabs";

export const dynamic = "force-dynamic";

export default function ProcurementContractsPage() {
  return (
    <div className="container container-record">
      <div style={{ marginBottom: 12 }}>
        <h1 style={{ marginBottom: 4 }}>Contracts</h1>
        <p className="muted" style={{ fontSize: 14 }}>
          Procurement clause library — same IDs as deals (PMCW-1 = PMCW-1). Master → wrapper → order → amendment.
        </p>
      </div>

      <DirectionTabs
        activeId="procurement"
        tabs={[
          { id: "sales", label: "Sales", href: "/contracts/sales", direction: "ORG_SELLING" },
          { id: "procurement", label: "Procurement", href: "/contracts/procurement", direction: "ORG_BUYING" },
        ]}
      />

      <div className="row" style={{ marginTop: 16, marginBottom: 16, justifyContent: "flex-start" }}>
        <Link className="btn" href="/contracts/new?direction=ORG_BUYING&from=/contracts/procurement">
          New procurement contract
        </Link>
      </div>

      <div style={{ marginBottom: 16 }}>
        <ContractWorkflowGuide direction="ORG_BUYING" />
      </div>

      <ContractsList direction="ORG_BUYING" />
    </div>
  );
}
