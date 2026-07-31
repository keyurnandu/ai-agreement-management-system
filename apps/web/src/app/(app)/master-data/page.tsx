import { MasterDataTable } from "@/components/MasterDataTable";

export const dynamic = "force-dynamic";

export default function MasterDataPage() {
  return (
    <div className="container">
      <div className="page-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="eyebrow">Master Data</div>
          <h1 style={{ margin: 0 }}>Product catalog</h1>
          <p className="muted" style={{ margin: "4px 0 0", maxWidth: 640 }}>
            One source of truth for products on both sides of the business — the products sales sells, and the
            products procurement has under signed agreements.
          </p>
        </div>
      </div>
      <MasterDataTable />
    </div>
  );
}
