"use client";

import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

interface Props {
  documentId: string;
  pageCount: number;
  canEdit: boolean;
  canComment: boolean;
  canManage: boolean;
  currentUserId: string;
  fileUrl: string | null;
}

type TextPage = { page: number; text: string };
type FormFieldT = { page: number; name: string | null; type: string; value: string | null; rect: number[] };
type Rect = { x: number; y: number; w: number; h: number };
type Annotation = {
  id: string;
  page: number;
  type: string;
  rect: Rect | null;
  color: string;
  text: string | null;
  resolved: boolean;
  authorId: string;
  authorEmail: string;
  createdAt: string;
};

export function PdfViewer({
  documentId,
  pageCount: initialCount,
  canEdit,
  canComment,
  canManage,
  currentUserId,
  fileUrl,
}: Props) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(initialCount || 1);
  const [dpi, setDpi] = useState(144);
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState<"page" | "text" | "comments" | "form">("page");
  const [text, setText] = useState<TextPage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [commentMode, setCommentMode] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldT[] | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formMsg, setFormMsg] = useState<string | null>(null);

  useEffect(() => setPageCount(initialCount || 1), [initialCount]);
  useEffect(() => setPage((p) => Math.min(Math.max(1, p), pageCount)), [pageCount]);

  const loadAnnotations = useCallback(async () => {
    const res = await fetch(`/api/documents/${documentId}/annotations`);
    if (res.ok) {
      const j = (await res.json()) as { annotations: Annotation[] };
      setAnnotations(j.annotations);
    }
  }, [documentId]);

  useEffect(() => {
    void loadAnnotations();
  }, [loadAnnotations]);

  const imgSrc = `/api/documents/${documentId}/render?page=${page}&dpi=${dpi}&v=${nonce}`;
  const canMutate = (a: Annotation) => canManage || a.authorId === currentUserId;

  async function loadText() {
    setTab("text");
    if (text) return;
    const res = await fetch(`/api/documents/${documentId}/text`);
    if (res.ok) setText(((await res.json()) as { pages: TextPage[] }).pages);
  }

  async function applyOp(ops: unknown, note: string) {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/documents/${documentId}/page-ops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ops, note }),
      });
      if (res.ok) {
        const j = (await res.json()) as { pageCount: number };
        setPageCount(j.pageCount || pageCount);
        setText(null);
        setNonce((n) => n + 1);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadForm() {
    setTab("form");
    setFormMsg(null);
    if (formFields) return;
    const res = await fetch(`/api/documents/${documentId}/form-fields`);
    if (res.ok) {
      const j = (await res.json()) as { fields: FormFieldT[] };
      setFormFields(j.fields);
      const init: Record<string, string> = {};
      for (const f of j.fields) if (f.name) init[f.name] = f.value ?? "";
      setFormValues(init);
    }
  }

  async function saveForm() {
    if (busy) return;
    setBusy(true);
    setFormMsg(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/fill-form`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: formValues }),
      });
      if (res.ok) {
        const j = (await res.json()) as { version: number; fieldsFilled: number };
        setFormMsg(`Saved v${j.version} (${j.fieldsFilled} filled)`);
        setNonce((n) => n + 1);
        router.refresh();
      } else {
        setFormMsg(`Error ${res.status}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPageClick(e: MouseEvent<HTMLDivElement>) {
    if (!commentMode || !canComment) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const note = window.prompt("Comment on this spot:");
    if (!note) return;
    await fetch(`/api/documents/${documentId}/annotations`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ page, type: "COMMENT", rect: { x, y, w: 0, h: 0 }, text: note }),
    });
    await loadAnnotations();
  }

  async function deleteAnnotation(annId: string) {
    await fetch(`/api/documents/${documentId}/annotations/${annId}`, { method: "DELETE" });
    await loadAnnotations();
  }

  async function toggleResolved(a: Annotation) {
    await fetch(`/api/documents/${documentId}/annotations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resolved: !a.resolved }),
    });
    await loadAnnotations();
  }

  const tb: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };
  const pagePins = annotations.filter((a) => a.page === page);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="row" style={{ padding: 12, borderBottom: "1px solid var(--border)", ...tb }}>
        <div style={tb}>
          <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹
          </button>
          <span className="muted" style={{ minWidth: 92, textAlign: "center" }}>
            page {page} / {pageCount}
          </span>
          <button className="btn secondary" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>
            ›
          </button>
          <span style={{ width: 8 }} />
          <button className="btn secondary" onClick={() => setDpi((d) => Math.max(72, d - 36))}>
            −
          </button>
          <span className="muted">{Math.round((dpi / 144) * 100)}%</span>
          <button className="btn secondary" onClick={() => setDpi((d) => Math.min(288, d + 36))}>
            +
          </button>
        </div>
        <div style={tb}>
          <button className="btn secondary" onClick={() => setTab("page")}>
            Page
          </button>
          <button className="btn secondary" onClick={loadText}>
            Text
          </button>
          <button className="btn secondary" onClick={() => setTab("comments")}>
            Comments ({annotations.length})
          </button>
          {canEdit ? (
            <button className="btn secondary" onClick={loadForm}>
              Form
            </button>
          ) : null}
          {fileUrl ? (
            <a className="btn secondary" href={fileUrl} target="_blank" rel="noreferrer">
              Open original
            </a>
          ) : null}
        </div>
      </div>

      {(canEdit || canComment) && tab === "page" ? (
        <div className="row" style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", ...tb }}>
          {canComment ? (
            <button
              className={commentMode ? "btn" : "btn secondary"}
              onClick={() => setCommentMode((v) => !v)}
              title="Click on the page to drop a comment"
            >
              💬 Comment {commentMode ? "ON" : "OFF"}
            </button>
          ) : null}
          {canEdit ? (
            <>
              <span className="muted" style={{ fontSize: 12 }}>
                page {page}:
              </span>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => applyOp({ op: "rotate", pages: [page], degrees: 90 }, `rotated page ${page}`)}
              >
                ⟳ Rotate
              </button>
              <button
                className="btn secondary"
                disabled={busy || pageCount <= 1}
                onClick={() => {
                  if (confirm(`Delete page ${page}? This creates a new version.`)) {
                    applyOp({ op: "delete", pages: [page] }, `deleted page ${page}`);
                  }
                }}
              >
                🗑 Delete
              </button>
            </>
          ) : null}
          {busy ? <span className="muted">working…</span> : null}
        </div>
      ) : null}

      <div style={{ padding: 16, background: "#0a0e15", minHeight: 420, textAlign: "center" }}>
        {tab === "page" ? (
          <div
            onClick={onPageClick}
            style={{
              position: "relative",
              display: "inline-block",
              lineHeight: 0,
              cursor: commentMode ? "crosshair" : "default",
              boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={imgSrc} src={imgSrc} alt={`page ${page}`} style={{ display: "block", maxWidth: "100%" }} />
            {pagePins.map((a) => {
              const r = a.rect ?? { x: 0.5, y: 0.5, w: 0, h: 0 };
              const isBox = r.w > 0 && r.h > 0;
              return (
                <button
                  key={a.id}
                  title={`${a.authorEmail}: ${a.text ?? ""}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setTab("comments");
                  }}
                  style={
                    isBox
                      ? {
                          position: "absolute",
                          left: `${r.x * 100}%`,
                          top: `${r.y * 100}%`,
                          width: `${r.w * 100}%`,
                          height: `${r.h * 100}%`,
                          background: `${a.color}55`,
                          border: `1px solid ${a.color}`,
                          cursor: "pointer",
                        }
                      : {
                          position: "absolute",
                          left: `${r.x * 100}%`,
                          top: `${r.y * 100}%`,
                          transform: "translate(-50%, -100%)",
                          width: 18,
                          height: 18,
                          borderRadius: "50% 50% 50% 0",
                          background: a.resolved ? "#64748b" : a.color,
                          border: "1px solid rgba(0,0,0,0.4)",
                          cursor: "pointer",
                          padding: 0,
                        }
                  }
                />
              );
            })}
          </div>
        ) : tab === "text" ? (
          <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "left" }}>
            {!text ? (
              <p className="muted">Loading text…</p>
            ) : (
              text.map((tp) => (
                <div key={tp.page} style={{ marginBottom: 18 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                    page {tp.page}
                  </div>
                  <pre
                    style={{
                      whiteSpace: "pre-wrap",
                      fontFamily: "ui-monospace, monospace",
                      fontSize: 12,
                      color: "var(--text)",
                      margin: 0,
                    }}
                  >
                    {tp.text || "(no extractable text)"}
                  </pre>
                </div>
              ))
            )}
          </div>
        ) : tab === "comments" ? (
          <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "left" }}>
            {annotations.length === 0 ? (
              <p className="muted">
                No comments yet.{" "}
                {canComment ? "Switch to the Page tab, turn Comment ON, and click the page." : null}
              </p>
            ) : (
              annotations.map((a) => (
                <div
                  key={a.id}
                  className="card"
                  style={{ marginBottom: 10, padding: 12, opacity: a.resolved ? 0.6 : 1 }}
                >
                  <div className="row">
                    <div className="muted" style={{ fontSize: 12 }}>
                      <span className="pill" style={{ marginRight: 6 }}>
                        p{a.page}
                      </span>
                      {a.authorEmail}
                      {a.resolved ? " · resolved" : ""}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn secondary"
                        style={{ padding: "4px 10px" }}
                        onClick={() => {
                          setPage(a.page);
                          setTab("page");
                        }}
                      >
                        Go to page
                      </button>
                      {canMutate(a) ? (
                        <>
                          <button
                            className="btn secondary"
                            style={{ padding: "4px 10px" }}
                            onClick={() => toggleResolved(a)}
                          >
                            {a.resolved ? "Reopen" : "Resolve"}
                          </button>
                          <button
                            className="btn secondary"
                            style={{ padding: "4px 10px" }}
                            onClick={() => deleteAnnotation(a.id)}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 14 }}>{a.text}</div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "left" }}>
            {formFields === null ? (
              <p className="muted">No form loaded.</p>
            ) : formFields.length === 0 ? (
              <p className="muted">This PDF has no fillable form fields.</p>
            ) : (
              <>
                {formFields.map((f, i) => (
                  <div key={(f.name ?? "f") + i} style={{ marginBottom: 12 }}>
                    <label className="label" style={{ marginTop: 0 }}>
                      {f.name} <span className="muted">({f.type}, p{f.page})</span>
                    </label>
                    <input
                      className="input"
                      value={formValues[f.name ?? ""] ?? ""}
                      onChange={(e) => setFormValues((v) => ({ ...v, [f.name ?? ""]: e.target.value }))}
                    />
                  </div>
                ))}
                <button className="btn" disabled={busy} onClick={saveForm} style={{ marginTop: 8 }}>
                  Save (new version)
                </button>
                {formMsg ? (
                  <span className="muted" style={{ marginLeft: 10 }}>
                    {formMsg}
                  </span>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
