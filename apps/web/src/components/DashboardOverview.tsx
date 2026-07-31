import Link from "next/link";
import type { Analytics } from "@/lib/analytics";

/* ── small inline icons ─────────────────────────────────────────── */
const I = {
  doc: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
  ),
  check: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
  ),
  layers: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>
  ),
  renew: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></svg>
  ),
};

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "var(--green)",
  IN_PROGRESS: "var(--accent)",
  SENT: "var(--violet)",
  DRAFT: "var(--muted)",
  DECLINED: "var(--red)",
  EXPIRED: "var(--amber)",
  VOIDED: "var(--amber)",
};
const STATUS_LABEL: Record<string, string> = {
  COMPLETED: "Completed",
  IN_PROGRESS: "In progress",
  SENT: "Out for signature",
  DRAFT: "Draft",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  VOIDED: "Voided",
};

function Donut({ data }: { data: Analytics["agreementStatus"] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (!total) {
    return <p className="muted" style={{ fontSize: 13 }}>No agreements yet.</p>;
  }
  let acc = 0;
  const stops: string[] = [];
  for (const d of data) {
    const start = (acc / total) * 360;
    acc += d.count;
    const end = (acc / total) * 360;
    stops.push(`${STATUS_COLOR[d.status] ?? "var(--muted)"} ${start}deg ${end}deg`);
  }
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: `conic-gradient(${stops.join(",")})` }}>
        <div className="donut-center">
          <div className="num">{total}</div>
          <div className="cap">agreements</div>
        </div>
      </div>
      <div className="legend">
        {data.map((d) => (
          <div className="legend-item" key={d.status}>
            <span className="swatch" style={{ background: STATUS_COLOR[d.status] ?? "var(--muted)" }} />
            {STATUS_LABEL[d.status] ?? d.status}
            <span className="lg-count">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VolumeBars({ volume }: { volume: Analytics["volume"] }) {
  const max = Math.max(1, ...volume.map((v) => v.count));
  const any = volume.some((v) => v.count > 0);
  return (
    <>
      <div className="bars">
        {volume.map((v) => (
          <div className="bar-col" key={v.week}>
            <span className="bar-value">{v.count || ""}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ height: `${(v.count / max) * 100}%` }} />
            </div>
            <span className="bar-label">{v.week}</span>
          </div>
        ))}
      </div>
      {!any ? <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>No agreements created in this window yet.</p> : null}
    </>
  );
}

function Funnel({ funnel }: { funnel: Analytics["funnel"] }) {
  const rows = [
    { name: "Recipients", count: funnel.total },
    { name: "Sent", count: funnel.sent },
    { name: "Viewed", count: funnel.viewed },
    { name: "Signed", count: funnel.signed },
  ];
  const max = Math.max(1, funnel.total);
  if (!funnel.total) {
    return <p className="muted" style={{ fontSize: 13 }}>No recipients in the pipeline yet.</p>;
  }
  return (
    <div className="funnel">
      {rows.map((r) => (
        <div className="funnel-row" key={r.name}>
          <span className="funnel-name">{r.name}</span>
          <div className="funnel-bar-track">
            <div className="funnel-bar-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </div>
          <span className="funnel-count">{r.count}</span>
        </div>
      ))}
      {funnel.declined > 0 ? (
        <div className="funnel-row">
          <span className="funnel-name" style={{ color: "var(--red)" }}>Declined</span>
          <div className="funnel-bar-track">
            <div className="funnel-bar-fill" style={{ width: `${(funnel.declined / max) * 100}%`, background: "var(--red)" }} />
          </div>
          <span className="funnel-count">{funnel.declined}</span>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardOverview({ a }: { a: Analytics }) {
  const cycle = a.cycleTime.avgDays;
  const kpis = [
    { cls: "", icon: I.doc, value: a.totals.agreements, label: "Total agreements", sub: `${a.totals.documents} documents · ${a.totals.contracts} contracts` },
    { cls: "green", icon: I.check, value: `${a.totals.completionRate}%`, label: "Completion rate", sub: `${a.totals.completed} completed` },
    { cls: "violet", icon: I.clock, value: cycle != null ? `${cycle}d` : "—", label: "Avg. cycle time", sub: a.cycleTime.count ? `across ${a.cycleTime.count} signed` : "no completed cycles yet" },
    { cls: "amber", icon: I.layers, value: a.activity7d, label: "Activity (7 days)", sub: `${a.upcoming.length} upcoming dates` },
  ];

  return (
    <>
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div className={`kpi ${k.cls}`} key={k.label}>
            <span className="kpi-icon">{k.icon}</span>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-sub">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Agreement volume</span>
            <span className="panel-hint">last 8 weeks</span>
          </div>
          <VolumeBars volume={a.volume} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Status breakdown</span>
          </div>
          <Donut data={a.agreementStatus} />
        </div>
      </div>

      <div className="dash-grid" style={{ marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Signature funnel</span>
            <span className="panel-hint">recipient progress</span>
          </div>
          <Funnel funnel={a.funnel} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <span className="panel-title">Upcoming renewals &amp; expiries</span>
            <span className="panel-hint">next 180 days</span>
          </div>
          {a.upcoming.length ? (
            <div className="mini-list">
              {a.upcoming.slice(0, 6).map((u, i) => (
                <div className="mini-row" key={i}>
                  <span className="mini-icon" style={u.days < 30 ? { background: "color-mix(in srgb, var(--amber) 18%, transparent)", color: "var(--amber)" } : undefined}>{I.renew}</span>
                  <div className="mini-body">
                    <div className="mini-title">{u.title}</div>
                    <div className="mini-sub">{u.kind} · {u.date}</div>
                  </div>
                  <span className="mini-when" style={u.days < 30 ? { color: "var(--amber)" } : undefined}>
                    {u.days < 0 ? "overdue" : `${u.days}d`}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>
              No renewals or expiries detected. Run attribute extraction on your documents to surface term dates.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

export function QuickActions() {
  const actions = [
    { href: "/deals/new?direction=ORG_SELLING&from=/deals/sales", title: "New sales deal", desc: "Sell to a customer — draft, negotiate, and send for signature." },
    { href: "/deals/new?direction=ORG_BUYING&from=/deals/procurement", title: "New procurement deal", desc: "Buy from a vendor — review paper, run compliance, sign." },
    { href: "/documents", title: "Upload & analyze a document", desc: "Extract terms, flag risks, and ask questions with AI." },
  ];
  return (
    <div className="qa-grid">
      {actions.map((act) => (
        <Link className="qa-tile" href={act.href} key={act.href}>
          <span className="qa-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </span>
          <div>
            <div className="qa-title">{act.title}</div>
            <div className="qa-desc">{act.desc}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
