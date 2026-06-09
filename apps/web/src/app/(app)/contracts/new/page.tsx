import Link from "next/link";
import { NewContract } from "@/components/NewContract";

export const dynamic = "force-dynamic";

export default function NewContractPage() {
  return (
    <div className="container">
      <Link href="/contracts" className="muted" style={{ fontSize: 13 }}>
        ← contracts
      </Link>
      <h1 style={{ marginTop: 6, marginBottom: 18 }}>New contract</h1>
      <NewContract />
    </div>
  );
}
