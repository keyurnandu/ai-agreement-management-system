import Link from "next/link";
import { AssistantChat } from "@/components/AssistantChat";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return (
    <div className="container">
      <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
        ← Home
      </Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <div className="eyebrow">Assistant</div>
          <h1 style={{ margin: 0 }}>ContractIQ Assistant</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Chat to look things up or get work done — compliance, issues, collections, signing.
          </p>
        </div>
      </div>
      <AssistantChat />
    </div>
  );
}
