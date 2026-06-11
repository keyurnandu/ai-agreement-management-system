"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChangeReviewPanel } from "@/components/ChangeReviewPanel";
import { ClauseBody } from "@/components/ClauseBody";
import { clauseForIssue } from "@/lib/issue-clause";
import type { ClauseChange } from "@/lib/clause-diff";

type Clause = { id: string; order: number; title: string; body: string };

type Issue = {
  id: string;
  severity: string;
  title: string;
  description: string;
  status: string;
  vendorResponse: string | null;
};

type DealInfo = {
  title: string;
  status: string;
  statusLabel: string;
  message: string | null;
  direction: string;
  version: number;
  pageCount: number;
  canUpload: boolean;
  canSign: boolean;
  signUrl: string | null;
  hasContract: boolean;
  lastDiff: {
    fromVersion: number | null;
    toVersion: number | null;
    summary: string | null;
    lines: unknown;
    clauseChanges?: ClauseChange[];
  } | null;
};

function linkedOpenIssue(issues: Issue[], clause: Clause): string | undefined {
  return issues.find((i) => i.status === "OPEN" && clauseForIssue([clause], i.title)?.id === clause.id)?.id;
}

export function VendorWorkspace({ token }: { token: string }) {
  const [deal, setDeal] = useState<DealInfo | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [issueId, setIssueId] = useState("");
  const [note, setNote] = useState("");
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pdfNonce, setPdfNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [dealRes, contractRes] = await Promise.all([
      fetch(`/api/vendor/${token}`),
      fetch(`/api/vendor/${token}/contract`),
    ]);
    if (dealRes.ok) {
      const j = await dealRes.json();
      setDeal(j.deal);
      setIssues(j.issues ?? []);
    }
    if (contractRes.ok) {
      const j = (await contractRes.json()) as { contract: { clauses: Clause[] } | null; canEdit: boolean };
      setClauses(j.contract?.clauses ?? []);
      setCanEdit(j.canEdit);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const openIssues = useMemo(() => issues.filter((i) => i.status === "OPEN"), [issues]);
  const pageCount = deal?.pageCount ?? 1;
  const version = deal?.version ?? 1;

  const imgSrc = `/api/vendor/${token}/render?page=${page}&dpi=132&v=${version}-${pdfNonce}`;

  function startEdit(c: Clause, linkedIssue?: string) {
    const issue = linkedIssue ?? linkedOpenIssue(issues, c);
    setEditId(c.id);
    setDraft(c.body);
    setIssueId(issue ?? "");
    setNote("");
    setErr(null);
    setActiveIssueId(issue ?? null);
  }

  function focusIssue(issue: Issue) {
    setActiveIssueId(issue.id);
    const match = clauseForIssue(clauses, issue.title);
    if (match && canEdit) startEdit(match, issue.id);
  }

  async function save() {
    if (!editId || busy) return;
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/vendor/${token}/contract/clauses/${editId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        body: draft,
        issueId: issueId || undefined,
        note: note.trim() || undefined,
      }),
    });
    setBusy(false);
    if (r.ok) {
      setEditId(null);
      setIssueId("");
      setActiveIssueId(null);
      setPdfNonce((n) => n + 1);
      await load();
      setMsg("Saved — your revision was sent for review.");
    } else {
      setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Save failed");
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/vendor/${token}/upload`, { method: "POST", body: fd });
    setBusy(false);
    if (r.ok) {
      setPdfNonce((n) => n + 1);
      await load();
      setMsg("PDF uploaded.");
    } else {
      setMsg(`Upload failed: ${((await r.json().catch(() => ({}))) as { error?: string }).error ?? r.status}`);
    }
  }

  if (!deal) return <p className="muted">Loading portal…</p>;

  const isProc = deal.direction === "ORG_BUYING";
  const orgTeam = isProc ? "procurement team" : "sales team";

  return (
    <div className="container container-record vendor-portal">
      <header className="record-header">
        <div className="record-header-main">
          <h1 style={{ margin: "0 0 4px" }}>{deal.title}</h1>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            <span className="pill">{deal.statusLabel}</span>
            {deal.message ? ` · ${deal.message}` : ""}
          </p>
          {msg ? <p className="muted" style={{ fontSize: 12, margin: "8px 0 0" }}>{msg}</p> : null}
        </div>
        <div className="record-header-actions">
          {deal.canSign && deal.signUrl ? (
            <a className="btn" href={deal.signUrl}>
              Sign
            </a>
          ) : null}
          {deal.canUpload ? (
            <label className="btn secondary" style={{ cursor: "pointer" }}>
              Upload PDF
              <input
                type="file"
                accept="application/pdf"
                hidden
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
            </label>
          ) : null}
        </div>
      </header>

      {deal.status === "DRAFT" && deal.canUpload ? (
        <p className="muted card" style={{ fontSize: 13, marginBottom: 12, padding: "10px 14px" }}>
          Upload your PDF to submit for review. The {orgTeam} may also email you when they officially release this deal.
        </p>
      ) : null}
      {!deal.canUpload && !deal.canSign ? (
        <p className="muted card" style={{ fontSize: 13, marginBottom: 12, padding: "10px 14px" }}>
          {deal.status === "UNDER_REVIEW" || deal.status === "APPROVED"
            ? `The ${orgTeam} is reviewing this document. Upload is closed until they request changes.`
            : deal.status === "COMPLETED"
              ? "This deal is complete. The portal is view-only."
              : "Upload and editing are not available in the current status."}
        </p>
      ) : null}

      {deal.lastDiff ? (
        <div style={{ marginBottom: 12 }}>
          <ChangeReviewPanel
            summary={deal.lastDiff.summary}
            fromVersion={deal.lastDiff.fromVersion}
            toVersion={deal.lastDiff.toVersion}
            lines={deal.lastDiff.lines}
            clauseChanges={deal.lastDiff.clauseChanges}
          />
        </div>
      ) : null}

      <div
        className={`vendor-workspace card${openIssues.length > 0 ? " has-issues" : ""}${!deal.hasContract || !clauses.length ? " pdf-only" : ""}`}
      >
        {openIssues.length > 0 ? (
          <aside className="vendor-issues-rail">
            <h2 className="vendor-panel-title">Issues ({openIssues.length})</h2>
            <p className="muted" style={{ fontSize: 12, margin: "0 0 10px" }}>
              Select an issue to jump to the clause and edit.
            </p>
            <ul className="vendor-issue-list">
              {openIssues.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={`vendor-issue-item${activeIssueId === i.id ? " active" : ""}`}
                    onClick={() => focusIssue(i)}
                  >
                    <span className="vendor-issue-title">{i.title}</span>
                    <span className="pill" style={{ fontSize: 10 }}>
                      {i.status}
                    </span>
                    <span className="vendor-issue-desc">{i.description}</span>
                    {i.vendorResponse ? <span className="muted" style={{ fontSize: 11 }}>✓ {i.vendorResponse}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        <div className="vendor-clauses contract-document">
          {deal.hasContract && clauses.length > 0 ? (
            <>
              <h2 className="vendor-panel-title">Contract</h2>
              <p className="muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
                Edit text here — the PDF preview updates when you save.
              </p>
              {clauses.map((c) => {
                const linked = openIssues.some(
                  (i) => activeIssueId === i.id && clauseForIssue([c], i.title)?.id === c.id,
                );
                return (
                  <div
                    key={c.id}
                    id={`clause-${c.id}`}
                    className={`clause-block${editId === c.id ? " editing" : ""}${linked ? " issue-focus" : ""}`}
                  >
                    <div className="clause-title">
                      {c.order}. {c.title}
                    </div>
                    {editId === c.id ? (
                      <div style={{ marginTop: 8 }}>
                        <textarea
                          className="input clause-body"
                          rows={6}
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          autoFocus
                        />
                        {issueId ? (
                          <input
                            className="input"
                            placeholder="Brief note on your fix (optional)"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            style={{ marginTop: 8 }}
                          />
                        ) : null}
                        {err ? <p className="error">{err}</p> : null}
                        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                          <button type="button" className="btn" disabled={busy || !canEdit} onClick={() => void save()}>
                            {busy ? "Saving…" : "Save & update preview"}
                          </button>
                          <button type="button" className="btn secondary" onClick={() => setEditId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <ClauseBody text={c.body} />
                        {canEdit ? (
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: "4px 10px", fontSize: 12, marginTop: 6 }}
                            onClick={() => startEdit(c)}
                          >
                            Edit
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <div style={{ padding: "24px 0" }}>
              <h2 className="vendor-panel-title">Document</h2>
              <p className="muted" style={{ fontSize: 13 }}>
                Review the PDF preview.{" "}
                {deal.canUpload
                  ? deal.status === "DRAFT"
                    ? "Upload your contract or order form (PDF) to submit."
                    : "Upload a revised PDF if needed."
                  : ""}
              </p>
            </div>
          )}
        </div>

        <aside className="vendor-pdf-rail">
          <div className="vendor-pdf-toolbar">
            <span className="muted" style={{ fontSize: 12 }}>
              Preview · v{version}
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                type="button"
                className="btn secondary"
                style={{ padding: "2px 8px", fontSize: 12 }}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </button>
              <span style={{ fontSize: 12, minWidth: 64, textAlign: "center" }}>
                {page} / {pageCount}
              </span>
              <button
                type="button"
                className="btn secondary"
                style={{ padding: "2px 8px", fontSize: 12 }}
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                →
              </button>
            </div>
          </div>
          <div className="vendor-pdf-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={imgSrc} src={imgSrc} alt={`Page ${page}`} className="vendor-pdf-img" />
          </div>
        </aside>
      </div>
    </div>
  );
}
