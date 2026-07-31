"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateCollectionButton({ parentId }: { parentId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/documents/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, collectionParentId: parentId }),
      });
      if (r.ok) {
        setName("");
        setOpen(false);
        window.dispatchEvent(new Event("documents-refresh"));
        router.refresh();
      } else {
        setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${r.status}`);
      }
    } catch {
      setErr("Could not create collection.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn secondary" onClick={() => setOpen(true)}>
        New collection
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input
        className="input"
        autoFocus
        placeholder="Collection name"
        value={name}
        style={{ width: 180, padding: "6px 10px" }}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void create();
          if (e.key === "Escape") {
            setOpen(false);
            setName("");
          }
        }}
      />
      <button type="button" className="btn" disabled={busy || !name.trim()} onClick={() => void create()}>
        {busy ? "…" : "Create"}
      </button>
      <button
        type="button"
        className="btn secondary"
        onClick={() => {
          setOpen(false);
          setName("");
          setErr(null);
        }}
      >
        Cancel
      </button>
      {err ? <span className="error" style={{ fontSize: 12 }}>{err}</span> : null}
    </span>
  );
}
