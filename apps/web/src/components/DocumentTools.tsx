"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

export function DocumentTools({ documentId, canEdit }: { documentId: string; canEdit: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
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
    <div className="card">
      <h2>Document tools</h2>
      {canEdit ? (
        <div style={{ marginBottom: 14 }}>
          <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={onMergeFile} />
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            style={{ width: "100%" }}
          >
            Merge a PDF in…
          </button>
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            Appends another PDF as a new version.
          </p>
        </div>
      ) : null}

      <label className="label" style={{ marginTop: 0 }}>
        Split pages to a new document
      </label>
      <input className="input" placeholder="e.g. 1-3,5" value={ranges} onChange={(e) => setRanges(e.target.value)} />
      <button
        className="btn secondary"
        disabled={busy || !ranges.trim()}
        onClick={onSplit}
        style={{ width: "100%", marginTop: 8 }}
      >
        Split to new document
      </button>

      {msg ? (
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          {msg}
        </p>
      ) : null}
    </div>
  );
}
