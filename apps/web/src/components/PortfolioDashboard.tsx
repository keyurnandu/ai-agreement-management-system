"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PortfolioAnalytics, PortfolioPhase, PortfolioRow } from "@/lib/portfolio-analytics";
import { ChatPanel } from "@/components/ChatPanel";

const PHASE_TABS: { id: PortfolioPhase | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "executing", label: "Executing" },
  { id: "draft", label: "Draft" },
  { id: "completed", label: "Completed" },
];

const PHASE_BADGE: Record<PortfolioPhase, string> = {
  draft: "gray",
  executing: "amber",
  completed: "green",
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export function PortfolioDashboard({ direction }: { direction: "ORG_SELLING" | "ORG_BUYING" }) {
  const [data, setData] = useState<PortfolioAnalytics | null>(null);
  const [phase, setPhase] = useState<PortfolioPhase | "all">("all");
  const [q, setQ] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/analytics/portfolio?direction=${direction}`);
    if (r.ok) setData((await r.json()) as PortfolioAnalytics);
  }, [direction]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows: PortfolioRow[] = data.rows;
    if (phase !== "all") rows = rows.filter((r) => r.phase === phase);
    const needle = q.trim().toLowerCase();
    if (needle) {
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(needle) ||
          (r.commercialId?.toLowerCase().includes(needle) ?? false) ||
          (r.counterparty?.toLowerCase().includes(needle) ?? false),
      );
    }
    return rows;
  }, [data, phase, q]);

  if (!data) return <p className="muted">Loading portfolio…</p>;

  const counterpartyLabel = direction === "ORG_SELLING" ? "Customer" : "Vendor";

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Total" value={data.counts.total} />
        <Stat label="Executing" value={data.counts.executing} />
        <Stat label="Draft" value={data.counts.draft} />
        <Stat label="Completed" value={data.counts.completed} />
      </div>

      <div className="row" style={{ flexWrap: "wrap", marginBottom: 12, gap: 8 }}>
        <div className="direction-tabs">
          {PHASE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`direction-tab${phase === t.id ? " active" : ""}`}
              onClick={() => setPhase(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ maxWidth: 280, flex: "1 1 200px" }}
          placeholder="Search name, ID, counterparty…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div style={{ flex: 1 }} />
        <button type="button" className={chatOpen ? "btn" : "btn secondary"} onClick={() => setChatOpen((v) => !v)}>
          💬 Ask AI
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <p className="muted" style={{ padding: 20, margin: 0 }}>
            No records match. Values like start date and contract total appear after you run attribute extraction on linked documents.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>{counterpartyLabel}</th>
                  <th>Type</th>
                  <th>Phase</th>
                  <th>Status</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td>
                      <Link href={r.href} style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                        {r.commercialId ?? "—"}
                      </Link>
                    </td>
                    <td>
                      <Link href={r.href} style={{ color: "inherit", textDecoration: "none" }}>
                        {r.title}
                      </Link>
                    </td>
                    <td className="muted">{r.counterparty ?? "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {r.recordType ?? "—"}
                    </td>
                    <td>
                      <span className={`badge ${PHASE_BADGE[r.phase]}`}>{r.phase}</span>
                    </td>
                    <td style={{ fontSize: 13 }}>{r.statusLabel}</td>
                    <td className="muted">{r.startDate ?? "—"}</td>
                    <td className="muted">{r.endDate ?? "—"}</td>
                    <td>{r.contractValue ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ChatPanel
        documentId=""
        title={direction === "ORG_SELLING" ? "Sales portfolio" : "Procurement portfolio"}
        scope="portfolio"
        askUrl={`/api/analytics/ask?direction=${direction}`}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </>
  );
}
