import Link from "next/link";
import { TailSpendWizard } from "@/components/TailSpendWizard";

export default function TailSpendPage() {
  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <Link href="/deals/procurement" className="muted" style={{ fontSize: 13 }}>
        ← procurement deals
      </Link>
      <h1 style={{ marginTop: 8 }}>Quick tail spend order</h1>
      <p className="lead" style={{ marginBottom: 16 }}>
        One-off vendor PO — standalone POR, no master contract, no file template. Vendor uploads in the portal.
      </p>
      <TailSpendWizard />
    </div>
  );
}
