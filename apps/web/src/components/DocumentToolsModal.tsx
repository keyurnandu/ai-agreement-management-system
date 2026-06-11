"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

/** Merge, split, and other PDF utilities — opened from a Tools button, not the main layout. */
export function DocumentToolsModal({ documentId, canEdit }: { documentId: string; canEdit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [ranges, setRanges] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onMergeFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/documents/${documentId}/merge`, { method: "POST", body: fd });
      if (res.ok) {
        const j = (await res.json()) as { version: number; pageCount: number };
        setMsg(`Merged → v${j.version} (${j.pageCount} pages)`);
        router.refresh();
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(j.error ?? `error ${res.status}`);
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSplit() {
    if (!ranges.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/split`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ranges }),
      });
      if (res.ok) {
        const j = (await res.json()) as { id: string };
        setOpen(false);
        router.push(`/documents/${j.id}`);
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setMsg(j.error ?? `error ${res.status}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
        Tools
      </button>

      {open ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <div
            className="modal-panel card"
            role="dialog"
            aria-labelledby="doc-tools-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="row" style={{ marginBottom: 14 }}>
              <h2 id="doc-tools-title" style={{ margin: 0 }}>
                PDF tools
              </h2>
              <button type="button" className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>

            {canEdit ? (
              <div style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Merge PDF</h3>
                <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={onMergeFile} />
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  style={{ width: "100%" }}
                >
                  Append another PDF…
                </button>
                <p className="muted" style={{ fontSize: 11, marginTop: 6, marginBottom: 0 }}>
                  Appends the file as a new version of this document.
                </p>
              </div>
            ) : null}

            <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>Split pages</h3>
            <label className="label" style={{ marginTop: 0 }}>
              Page ranges (new document)
            </label>
            <input
              className="input"
              placeholder="e.g. 1-3,5"
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
            />
            <button
              className="btn secondary"
              disabled={busy || !ranges.trim()}
              onClick={() => void onSplit()}
              style={{ width: "100%", marginTop: 8 }}
            >
              Split to new document
            </button>

            {msg ? (
              <p className="muted" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
                {msg}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
