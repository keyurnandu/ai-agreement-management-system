import { CycleHub } from "@/components/CycleHub";
import { HelpLink } from "@/components/HelpLink";
import { DashboardOverview, QuickActions } from "@/components/DashboardOverview";
import { getAnalytics } from "@/lib/analytics";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const analytics = await getAnalytics();
  const name = session?.user?.email?.split("@")[0] ?? "there";
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="container container-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview</div>
          <h1 style={{ textTransform: "capitalize" }}>Welcome back, {name}</h1>
          <p className="muted" style={{ margin: 0 }}>{today} · portfolio at a glance</p>
        </div>
      </div>

      <DashboardOverview a={analytics} />

      <div className="section-head">
        <h2>Quick actions</h2>
      </div>
      <QuickActions />

      <div className="section-head">
        <h2>Your workspaces</h2>
        <HelpLink style={{ fontSize: 13 }} />
      </div>
      <CycleHub />
    </div>
  );
}
