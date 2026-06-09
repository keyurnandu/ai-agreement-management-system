"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

export function UploadButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", file.name.replace(/\.pdf$/i, ""));
      const res = await fetch("/api/documents", { method: "POST", body: fd });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `upload failed (${res.status})`);
      }
      const doc = (await res.json()) as { id: string };
      router.push(`/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <span>
      <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={onChange} />
      <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Uploading…" : "Upload PDF"}
      </button>
      {error ? (
        <span className="error" style={{ marginLeft: 10 }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
