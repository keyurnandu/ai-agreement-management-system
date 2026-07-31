"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type AgreementRow = {
  id: string;
  title: string;
  status: string;
  routingType: string;
  updatedAt: Date;
  signed: number;
  signers: number;
};

const STATUS_META: Record<string, { label: string; badge: string }> = {
  DRAFT: { label: "Draft", badge: "gray" },
  SENT: { label: "Sent", badge: "blue" },
  IN_PROGRESS: { label: "In progress", badge: "amber" },
  COMPLETED: { label: "Completed", badge: "green" },
  DECLINED: { label: "Declined", badge: "red" },
  VOIDED: { label: "Voided", badge: "red" },
  EXPIRED: { label: "Expired", badge: "red" },
};

const GROUPS: { id: string; label: string; match: (s: string) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "flight", label: "In flight", match: (s) => s === "SENT" || s === "IN_PROGRESS" },
  { id: "completed", label: "Completed", match: (s) => s === "COMPLETED" },
  { id: "draft", label: "Draft", match: (s) => s === "DRAFT" },
  { id: "closed", label: "Declined / Expired", match: (s) => s === "DECLINED" || s === "VOIDED" || s === "EXPIRED" },
];

function fmtDate(d: Date): string {
  const date = new Date(d);
  const diff = Date.now() - date.getTime();
  const day = 86400000;
  if (diff < 0) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AgreementsTable({ rows }: { rows: AgreementRow[] }) {
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const g of GROUPS) c[g.id] = rows.filter((r) => g.match(r.status)).length;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const g = GROUPS.find((x) => x.id === group) ?? GROUPS[0];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => g.match(r.status) && (!q || r.title.toLowerCase().includes(q)));
  }, [rows, group, search]);

  if (rows.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          No agreements in this cycle yet. Approve a deal and use <strong>Start signing</strong> on the deal page.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="agreements-toolbar">
        <div className="direction-tabs" style={{ flexWrap: "wrap" }}>
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={`direction-tab${group === g.id ? " active" : ""}`}
              onClick={() => setGroup(g.id)}
            >
              {g.label} <span className="agreements-count">{counts[g.id]}</span>
            </button>
          ))}
        </div>
        <input
          className="input"
          style={{ maxWidth: 260, flex: "1 1 180px" }}
          placeholder="Search agreements…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <p className="muted" style={{ padding: 18, margin: 0 }}>
            No agreements match{search.trim() ? ` “${search.trim()}”` : ""} in this view.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Agreement</th>
                  <th>Status</th>
                  <th>Signing</th>
                  <th>Routing</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const meta = STATUS_META[a.status] ?? { label: a.status, badge: "gray" };
                  const pct = a.signers ? Math.round((a.signed / a.signers) * 100) : 0;
                  const done = a.status === "COMPLETED";
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/agreements/${a.id}`} style={{ fontWeight: 500 }}>
                          {a.title}
                        </Link>
                      </td>
                      <td>
                        <span className={`badge ${meta.badge}`}>{meta.label}</span>
                      </td>
                      <td>
                        <div className="sign-progress" title={`${a.signed} of ${a.signers} signed`}>
                          <div className="sign-progress-track">
                            <div
                              className="sign-progress-fill"
                              style={{ width: `${pct}%`, background: done ? "var(--green)" : "var(--accent)" }}
                            />
                          </div>
                          <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                            {a.signed}/{a.signers}
                          </span>
                        </div>
                      </td>
                      <td className="muted" style={{ fontSize: 13, textTransform: "capitalize" }}>
                        {a.routingType.toLowerCase()}
                      </td>
                      <td className="muted" style={{ fontSize: 13 }} title={new Date(a.updatedAt).toLocaleString()}>
                        {fmtDate(a.updatedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
