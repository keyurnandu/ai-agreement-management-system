import Link from "next/link";
import { auth } from "@/lib/auth";
import { roleAtLeast } from "@/lib/rbac";
import { getAnalytics, type Analytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card">
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {sub ? <div className="muted" style={{ fontSize: 11 }}>{sub}</div> : null}
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row" style={{ fontSize: 12, marginBottom: 4 }}>
        <span>{label}</span>
        <span className="muted">{value}</span>
      </div>
      <div style={{ height: 8, background: "var(--panel-2)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color ?? "var(--accent)" }} />
      </div>
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "var(--muted)",
  SENT: "var(--accent)",
  IN_PROGRESS: "var(--amber)",
  COMPLETED: "var(--green)",
  DECLINED: "var(--red)",
  VOIDED: "var(--red)",
  EXPIRED: "var(--red)",
};

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user) return null;
  const ownerId = roleAtLeast(session.user.role, "MANAGER") ? undefined : session.user.id;
  const a: Analytics = await getAnalytics(ownerId);

  const maxStatus = Math.max(1, ...a.agreementStatus.map((s) => s.count));
  const maxVol = Math.max(1, ...a.volume.map((v) => v.count));
  const maxTpl = Math.max(1, ...a.contractsByTemplate.map((t) => t.count));
  const funnelMax = Math.max(1, a.funnel.sent, a.funnel.viewed, a.funnel.signed);

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 18 }}>
        <div>
          <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
            ← dashboard
          </Link>
          <h1 style={{ marginTop: 6 }}>Analytics</h1>
        </div>
        <span className="pill">{a.scope === "all" ? "org-wide" : "my items"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <Stat label="Agreements" value={a.totals.agreements} />
        <Stat label="Completed" value={a.totals.completed} sub={`${a.totals.completionRate}% completion`} />
        <Stat label="Avg cycle time" value={a.cycleTime.avgDays != null ? `${a.cycleTime.avgDays}d` : "—"} sub={a.cycleTime.count ? `median ${a.cycleTime.medianDays}d · n=${a.cycleTime.count}` : "no completed yet"} />
        <Stat label="Documents" value={a.totals.documents} />
        <Stat label="Contracts" value={a.totals.contracts} />
        <Stat label="Activity (7d)" value={a.activity7d} sub="audited events" />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Agreement status</h2>
          {a.agreementStatus.length ? (
            a.agreementStatus.map((s) => (
              <Bar key={s.status} label={s.status} value={s.count} max={maxStatus} color={STATUS_COLOR[s.status]} />
            ))
          ) : (
            <p className="muted">No agreements yet.</p>
          )}
        </div>
        <div className="card">
          <h2>Signing funnel</h2>
          <Bar label="Sent" value={a.funnel.sent} max={funnelMax} color="var(--accent)" />
          <Bar label="Viewed" value={a.funnel.viewed} max={funnelMax} color="var(--amber)" />
          <Bar label="Signed" value={a.funnel.signed} max={funnelMax} color="var(--green)" />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {a.funnel.total} recipients · {a.funnel.declined} declined
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>New agreements (8 weeks)</h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, marginTop: 8 }}>
            {a.volume.map((v) => (
              <div key={v.week} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                <div
                  title={String(v.count)}
                  style={{
                    height: `${maxVol > 0 ? Math.round((v.count / maxVol) * 100) : 0}%`,
                    background: "var(--accent)",
                    borderRadius: "3px 3px 0 0",
                    minHeight: v.count ? 3 : 0,
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {a.volume.map((v) => (
              <div key={v.week} className="muted" style={{ flex: 1, textAlign: "center", fontSize: 9 }}>
                {v.week}
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Contracts by template</h2>
          {a.contractsByTemplate.length ? (
            a.contractsByTemplate.map((t) => <Bar key={t.name} label={t.name} value={t.count} max={maxTpl} />)
          ) : (
            <p className="muted">No contracts authored yet.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Upcoming expiries &amp; renewals</h2>
        {a.upcoming.length ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                <th style={{ padding: "6px 8px" }}>Type</th>
                <th style={{ padding: "6px 8px" }}>Title</th>
                <th style={{ padding: "6px 8px" }}>Date</th>
                <th style={{ padding: "6px 8px" }}>In</th>
              </tr>
            </thead>
            <tbody>
              {a.upcoming.map((u, i) => (
                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 8px" }}>
                    <span className="pill">{u.kind}</span>
                  </td>
                  <td style={{ padding: "6px 8px" }}>{u.title}</td>
                  <td style={{ padding: "6px 8px" }} className="muted">{u.date}</td>
                  <td style={{ padding: "6px 8px", color: u.days < 0 ? "var(--red)" : u.days <= 14 ? "var(--amber)" : "var(--text)" }}>
                    {u.days < 0 ? `${-u.days}d overdue` : `${u.days}d`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">
            Nothing upcoming. Renewals appear here once documents have <code>effective_date</code> + <code>term_months</code>{" "}
            attributes extracted.
          </p>
        )}
      </div>
    </div>
  );
}
