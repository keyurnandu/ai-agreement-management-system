import { CycleHub } from "@/components/CycleHub";
import { HelpLink } from "@/components/HelpLink";
import { WorkflowGuide } from "@/components/WorkflowGuide";

export default function DashboardPage() {
  return (
    <div className="container">
      <h1>Home</h1>
      <p className="muted" style={{ marginBottom: 20, maxWidth: 720 }}>
        Two parallel cycles — <strong>Sales</strong> (org selling to customers) and{" "}
        <strong>Procurement</strong> (org buying from vendors). Each has deals (live workflow), contracts (clause
        library), and analytics. Demo data loads with <code>npm run db:seed</code>.
      </p>

      <CycleHub />

      <div style={{ marginTop: 28 }}>
        <WorkflowGuide />
      </div>

      <p style={{ fontSize: 13, marginTop: 20 }}>
        <HelpLink style={{ fontSize: 13 }} />
      </p>
    </div>
  );
}
