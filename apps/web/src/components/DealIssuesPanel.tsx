"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { onComplianceStatus, type ComplianceStatus } from "@/lib/deal-events";

export type DealIssue = {
  id: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  vendorResponse: string | null;
  page: number | null;
  raisedBySide?: string;
};

type DealIssuesData = {
  direction: string;
  issues: DealIssue[];
};

export function DealIssuesPanel({
  dealId,
  variant = "card",
  activeIssueId,
  onIssueClick,
}: {
  dealId: string;
  variant?: "rail" | "card";
  activeIssueId?: string | null;
  onIssueClick?: (issue: DealIssue) => void;
}) {
  const [data, setData] = useState<DealIssuesData | null>(null);
  const [compliance, setCompliance] = useState<ComplianceStatus>({ phase: "idle" });

  const [busyIssue, setBusyIssue] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}`);
    if (r.ok) {
      const j = (await r.json()) as { deal: DealIssuesData };
      setData({ direction: j.deal.direction, issues: j.deal.issues ?? [] });
    }
  }, [dealId]);

  const updateIssue = useCallback(
    async (issueId: string, status: "RESOLVED" | "WAIVED" | "OPEN") => {
      setBusyIssue(issueId);
      try {
        let note: string | undefined;
        if (status === "WAIVED") {
          const reason = window.prompt("Reason for waiving this issue (recorded on the deal):");
          if (reason === null) return;
          note = reason;
        }
        await fetch(`/api/deals/${dealId}/issues/${issueId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status, note }),
        });
        await load();
        notifyDealRefresh();
      } finally {
        setBusyIssue(null);
      }
    },
    [dealId, load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener("deal-refresh", onRefresh);
    return () => window.removeEventListener("deal-refresh", onRefresh);
  }, [load]);

  useEffect(() => onComplianceStatus(setCompliance), []);

  if (!data) {
    return variant === "rail" ? (
      <aside className="negotiation-issues-rail">
        <p className="muted" style={{ fontSize: 13 }}>Loading issues…</p>
      </aside>
    ) : (
      <div className="card" id="review-issues">
        <p className="muted">Loading issues…</p>
      </div>
    );
  }

  const openIssues = data.issues.filter((i) => i.status === "OPEN");
  const counterparty = data.direction === "ORG_BUYING" ? "Vendor" : "Customer";
  const team = data.direction === "ORG_BUYING" ? "Procurement" : "Sales";

  const complianceBlock =
    compliance.phase === "running" ? (
      <div className="compliance-status compliance-running">
        <Spinner size={16} />
        <span>Running compliance check against your rule pack…</span>
      </div>
    ) : compliance.phase === "done" ? (
      <div className="compliance-status compliance-done">
        <strong>{compliance.message}</strong>
        {compliance.findings && compliance.findings.length > 0 ? (
          <ul className="compliance-findings">
            {compliance.findings.map((f) => (
              <li key={f.id}>
                <span className="pill" style={{ fontSize: 10, marginRight: 6 }}>
                  {f.severity}
                </span>
                {f.title}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : compliance.phase === "error" ? (
      <div className="compliance-status compliance-error">{compliance.message}</div>
    ) : null;

  const inner = (
    <>
      <h2 className="negotiation-panel-title" style={{ marginTop: 0 }}>
        Review issues
        <span className="pill" style={{ marginLeft: 8, fontSize: 11 }}>
          {openIssues.length} open
        </span>
      </h2>
      <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
        Output from <strong>Run compliance check</strong> appears here. {team} can also add issues manually.
      </p>
      {complianceBlock}
      {data.issues.length === 0 && compliance.phase !== "running" ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No issues yet.
        </p>
      ) : (
        <ul className="negotiation-issue-list">
          {data.issues.map((i) => {
            const active = activeIssueId === i.id;
            return (
              <li
                key={i.id}
                className={`negotiation-issue-item${i.status !== "OPEN" ? " resolved" : ""}${active ? " active" : ""}`}
              >
                {onIssueClick ? (
                  <button type="button" className="issue-rowbtn" onClick={() => onIssueClick(i)}>
                    <IssueRow issue={i} counterparty={counterparty} />
                  </button>
                ) : (
                  <IssueRow issue={i} counterparty={counterparty} />
                )}
                <div className="issue-actions">
                  {i.status === "OPEN" ? (
                    <>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busyIssue === i.id}
                        onClick={() => void updateIssue(i.id, "RESOLVED")}
                      >
                        ✓ Resolve
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busyIssue === i.id}
                        onClick={() => void updateIssue(i.id, "WAIVED")}
                        title="Accept this deviation and record a reason"
                      >
                        Waive
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={busyIssue === i.id}
                      onClick={() => void updateIssue(i.id, "OPEN")}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  if (variant === "rail") {
    return (
      <aside className="negotiation-issues-rail" id="review-issues">
        {inner}
      </aside>
    );
  }

  return (
    <div className="card" id="review-issues">
      {inner}
    </div>
  );
}

function IssueRow({ issue: i, counterparty }: { issue: DealIssue; counterparty: string }) {
  return (
    <>
      <div className="row" style={{ alignItems: "flex-start", gap: 6 }}>
        <strong style={{ fontSize: 13 }}>{i.title}</strong>
        <span className="pill" style={{ fontSize: 10 }}>
          {i.severity} · {i.status}
        </span>
      </div>
      <p style={{ fontSize: 12, margin: "4px 0 0", lineHeight: 1.45 }}>{i.description}</p>
      {i.raisedBySide === "SYSTEM" ? (
        <span className="muted" style={{ fontSize: 10 }}>Compliance</span>
      ) : null}
      {i.vendorResponse ? (
        <p className="muted" style={{ fontSize: 11, margin: "4px 0 0" }}>
          {counterparty}: {i.vendorResponse}
        </p>
      ) : null}
    </>
  );
}

export function notifyDealRefresh() {
  window.dispatchEvent(new Event("deal-refresh"));
}

export function useScrollToIssues() {
  const ref = useRef(false);
  return () => {
    if (ref.current) return;
    ref.current = true;
    window.setTimeout(() => {
      document.getElementById("review-issues")?.scrollIntoView({ behavior: "smooth", block: "start" });
      ref.current = false;
    }, 120);
  };
}
