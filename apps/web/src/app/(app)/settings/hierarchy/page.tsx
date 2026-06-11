import { CommercialHierarchyAdmin } from "@/components/CommercialHierarchyAdmin";

export default function HierarchySettingsPage() {
  return (
    <>
      <h2 style={{ marginTop: 0 }}>Commercial hierarchy</h2>
      <p className="lead">
        Configure master → PCW/SCW → order → amendment types for sales and procurement. These drive deal and contract
        IDs (SMCW-1, POR-2, etc.).
      </p>
      <CommercialHierarchyAdmin />
    </>
  );
}
