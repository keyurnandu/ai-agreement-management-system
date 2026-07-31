"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeReviewPanel } from "@/components/ChangeReviewPanel";
import { DealActivityPanel } from "@/components/DealActivityPanel";
import { DealIssuesPanel, notifyDealRefresh, useScrollToIssues, type DealIssue } from "@/components/DealIssuesPanel";
import { DealPhaseBar } from "@/components/DealPhaseBar";
import { DealSigningPanel } from "@/components/DealSigningPanel";
import { HelpLink } from "@/components/HelpLink";
import { RemoveButton } from "@/components/RemoveButton";
import { Spinner } from "@/components/Spinner";
import { ContractClauses } from "@/components/ContractView";
import { LinkContractPanel } from "@/components/LinkContractPanel";
import { dealsListHref } from "@/lib/record-nav";
import { emitComplianceStatus } from "@/lib/deal-events";
import type { ClauseChange } from "@/lib/clause-diff";

type Issue = DealIssue;

type Deal = {
  id: string;
  commercialId: string | null;
  recordTypeLabel: string;
  parentDeal: { id: string; commercialId: string | null; title: string } | null;
  childDeals: { id: string; commercialId: string | null; title: string; status: string }[];
  allowedChildTypes: { id: string; prefix: string; name: string }[];
  title: string;
  direction: string;
  status: string;
  statusLabel: string;
  vendorEmail: string;
  vendorName: string | null;
  contractId: string | null;
  vendorPortalUrl: string;
  agreementId: string | null;
  issues: Issue[];
  lastDiff: {
    fromVersion: number | null;
    toVersion: number | null;
    summary: string | null;
    lines: unknown;
    clauseChanges?: ClauseChange[];
  } | null;
};

function IssueForm({ onSubmit }: { onSubmit: (body: { title: string; description: string; severity: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");

  if (!open) {
    return (
      <button type="button" className="btn secondary" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setOpen(true)}>
        Add issue manually
      </button>
    );
  }

  return (
    <div className="form-stack" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <label className="label">Issue title</label>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="label">Description</label>
      <textarea className="input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      <label className="label">Severity</label>
      <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
      </select>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          disabled={!title.trim() || !description.trim()}
          onClick={() => {
            onSubmit({ title: title.trim(), description: description.trim(), severity });
            setTitle("");
            setDescription("");
            setSeverity("MEDIUM");
            setOpen(false);
          }}
        >
          Save issue
        </button>
        <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Sticky deal actions — mount in RecordWorkspace toolbar slot. */
export function DealToolbar({ dealId }: { dealId: string }) {
  const router = useRouter();
  const scrollToIssues = useScrollToIssues();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}`);
    if (r.ok) setDeal(((await r.json()) as { deal: Deal }).deal);
  }, [dealId]);

  async function copyPortalLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard blocked — the link is still visible to copy manually */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, actionId: string, method = "POST", body?: unknown) {
    setBusyAction(actionId);
    setMsg(null);
    if (actionId === "compliance") {
      emitComplianceStatus({ phase: "running" });
    }
    let j: {
      portalUrl?: string;
      agreementId?: string;
      resent?: boolean;
      issues?: number;
      findings?: { id: string; title: string; severity: string; description: string }[];
      error?: string;
    } = {};
    try {
      const r = await fetch(path, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      j = (await r.json().catch(() => ({}))) as typeof j;
      if (!r.ok) {
        const err = j.error ?? `Error ${r.status}`;
        setMsg(err);
        if (actionId === "compliance") {
          emitComplianceStatus({ phase: "error", message: err });
        }
        return;
      }
      await load();
      notifyDealRefresh();
      router.refresh();
      if (j.portalUrl) {
        setMsg(
          j.resent
            ? "Portal invite resent — share the link below."
            : "Sent to counterparty — copy the portal link below to share it.",
        );
      }
      if (j.agreementId) {
        setMsg("Signing started — send for signature below when ready.");
      }
      if (actionId === "compliance") {
        const n = j.issues ?? 0;
        const text =
          n === 0
            ? "Compliance check complete — no new issues. Deal moved to under review."
            : `Found ${n} compliance issue${n === 1 ? "" : "s"}.`;
        setMsg(text);
        emitComplianceStatus({ phase: "done", count: n, message: text, findings: j.findings });
        scrollToIssues();
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : "Request failed";
      setMsg(err);
      if (actionId === "compliance") {
        emitComplianceStatus({ phase: "error", message: err });
      }
    } finally {
      setBusyAction(null);
    }
  }

  if (!deal) {
    return (
      <div className="deal-toolbar card">
        <Spinner size={16} /> <span className="muted" style={{ fontSize: 13 }}>Loading workflow…</span>
      </div>
    );
  }

  const openIssues = deal.issues.filter((i) => i.status === "OPEN").length;
  const listHref = dealsListHref(deal.direction);
  const canSendPortal = ["DRAFT", "WITH_VENDOR", "VENDOR_SUBMITTED", "UNDER_REVIEW", "ISSUES_OPEN"].includes(deal.status);
  const complianceBusy = busyAction === "compliance";

  return (
    <div className="deal-toolbar card">
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DealPhaseBar status={deal.status} />
          <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
            {deal.recordTypeLabel} · {deal.vendorName ?? deal.vendorEmail}
            {openIssues > 0 ? (
              <span className="pill" style={{ marginLeft: 8, color: "var(--amber)", borderColor: "rgba(251,191,36,0.4)" }}>
                {openIssues} open
              </span>
            ) : null}
          </p>
          {msg ? <p style={{ fontSize: 12, margin: "6px 0 0", color: "var(--accent)" }}>{msg}</p> : null}
        </div>
        <RemoveButton
          label="Delete"
          confirmMessage={`Delete deal "${deal.title}"?`}
          onDelete={async () => {
            const r = await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
            if (r.ok) return { ok: true };
            const j = (await r.json().catch(() => ({}))) as { error?: string };
            return { ok: false, error: j.error ?? `Error ${r.status}` };
          }}
          onDone={() => router.push(listHref)}
        />
      </div>

      <div className="deal-toolbar-actions">
        {canSendPortal ? (
          <button className="btn" disabled={!!busyAction} onClick={() => void act(`/api/deals/${dealId}/send-vendor`, "send")}>
            {deal.status === "DRAFT" ? "Send to counterparty" : "Resend portal invite"}
          </button>
        ) : null}
        {["DRAFT", "WITH_VENDOR", "VENDOR_SUBMITTED", "UNDER_REVIEW", "ISSUES_OPEN"].includes(deal.status) ? (
          <button
            className="btn secondary"
            disabled={!!busyAction}
            onClick={() => void act(`/api/deals/${dealId}/compliance-check`, "compliance")}
          >
            {complianceBusy ? (
              <>
                <Spinner size={14} style={{ marginRight: 6, verticalAlign: "middle" }} /> Checking…
              </>
            ) : (
              "Run compliance check"
            )}
          </button>
        ) : null}
        {openIssues === 0 && ["UNDER_REVIEW", "VENDOR_SUBMITTED", "ISSUES_OPEN"].includes(deal.status) ? (
          <button className="btn secondary" disabled={!!busyAction} onClick={() => void act(`/api/deals/${dealId}/approve`, "approve")}>
            Approve document
          </button>
        ) : null}
        {deal.status === "APPROVED" ? (
          <button className="btn" disabled={!!busyAction} onClick={() => void act(`/api/deals/${dealId}/start-signing`, "sign")}>
            Start signing
          </button>
        ) : null}
        <HelpLink style={{ alignSelf: "center" }} />
      </div>

      {canSendPortal && deal.vendorPortalUrl ? (
        <div className="portal-link">
          <div className="portal-link-head">
            <span className="portal-link-label">Counterparty portal link</span>
            <button
              type="button"
              className="btn secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() => void copyPortalLink(deal.vendorPortalUrl)}
            >
              {copied ? "✓ Copied" : "Copy link"}
            </button>
          </div>
          <a className="portal-link-url" href={deal.vendorPortalUrl} target="_blank" rel="noreferrer">
            {deal.vendorPortalUrl}
          </a>
          <p className="portal-link-hint">
            No login needed — {deal.vendorName ?? deal.vendorEmail} opens this to review, raise issues, edit clauses, or upload
            their paper. Open it yourself in a private window to preview the counterparty view.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Contract + issues grid for deal and contract pages. */
export function DealNegotiationGrid({
  dealId,
  contractId,
  direction,
  commercialId,
  commercialTypeKey,
  status,
  showIssueForm,
}: {
  dealId: string;
  contractId: string | null;
  direction: "ORG_SELLING" | "ORG_BUYING";
  commercialId: string | null;
  commercialTypeKey?: string | null;
  status?: string;
  showIssueForm?: boolean;
}) {
  return (
    <div className={`negotiation-workspace${contractId ? " has-contract" : ""}`}>
      <DealIssuesPanel dealId={dealId} variant="rail" />
      <div className="negotiation-center">
        {contractId ? (
          <ContractClauses contractId={contractId} embedded />
        ) : (
          <LinkContractPanel
            dealId={dealId}
            commercialId={commercialId}
            direction={direction}
            commercialTypeKey={commercialTypeKey}
            status={status}
          />
        )}
        {showIssueForm ? (
          <div className="card" style={{ marginTop: 12 }}>
            <IssueForm
              onSubmit={(body) => {
                void fetch(`/api/deals/${dealId}/issues`, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(body),
                }).then(() => notifyDealRefresh());
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Signing, diffs, linked records, activity — below PDF on deal page. */
export function DealWorkflowExtras({ dealId }: { dealId: string }) {
  const [deal, setDeal] = useState<Deal | null>(null);
  const [activityKey, setActivityKey] = useState(0);

  const load = useCallback(async () => {
    const r = await fetch(`/api/deals/${dealId}`);
    if (r.ok) setDeal(((await r.json()) as { deal: Deal }).deal);
  }, [dealId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => {
      void load();
      setActivityKey((k) => k + 1);
    };
    window.addEventListener("deal-refresh", onRefresh);
    return () => window.removeEventListener("deal-refresh", onRefresh);
  }, [load]);

  if (!deal) return null;

  const listHref = dealsListHref(deal.direction);
  const hierarchyHint =
    deal.direction === "ORG_BUYING"
      ? "PMCW → PCW → POR. PAM on master or PCW."
      : "SMCW → SCW → SOR. SAM on master or SCW.";

  return (
    <div className="grid" style={{ gap: 16 }}>
      {deal.agreementId ? (
        <DealSigningPanel
          agreementId={deal.agreementId}
          dealId={dealId}
          onUpdate={() => {
            void load();
            setActivityKey((k) => k + 1);
          }}
        />
      ) : null}

      {(deal.childDeals?.length ?? 0) > 0 || (deal.allowedChildTypes?.length ?? 0) > 0 ? (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>Child deals</h2>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            {hierarchyHint} — not the same as linking a <strong>contract</strong> (clause library) above.
          </p>
          {deal.childDeals?.length ? (
            <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 13 }}>
              {deal.childDeals.map((c) => (
                <li key={c.id} style={{ marginBottom: 6 }}>
                  <Link href={`/deals/${c.id}`}>
                    {c.commercialId ?? c.title} — {c.title}
                  </Link>
                  <span className="muted"> · {c.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>No child records yet.</p>
          )}
          {deal.allowedChildTypes?.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {deal.allowedChildTypes.map((t) => (
                <Link
                  key={t.id}
                  className="btn secondary"
                  href={`/deals/new?parentId=${dealId}&typeId=${t.id}&direction=${deal.direction}&from=${encodeURIComponent(listHref)}`}
                >
                  + {t.prefix}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {deal.lastDiff ? (
        <ChangeReviewPanel
          summary={deal.lastDiff.summary}
          fromVersion={deal.lastDiff.fromVersion}
          toVersion={deal.lastDiff.toVersion}
          lines={deal.lastDiff.lines}
          clauseChanges={deal.lastDiff.clauseChanges}
        />
      ) : null}

      <DealActivityPanel dealId={dealId} refreshKey={activityKey} />
    </div>
  );
}

export function DealWorkflow({ dealId }: { dealId: string }) {
  return (
    <>
      <DealToolbar dealId={dealId} />
      <DealWorkflowExtras dealId={dealId} />
    </>
  );
}

export function DealPanel({ dealId }: { dealId: string }) {
  return <DealWorkflow dealId={dealId} />;
}
