"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateCollectionButton({ parentId }: { parentId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    const title = window.prompt("Collection name:");
    if (!title?.trim()) return;
    setBusy(true);
    const r = await fetch("/api/documents/collections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim(), collectionParentId: parentId }),
    });
    setBusy(false);
    if (r.ok) router.refresh();
    else alert(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Failed");
  }

  return (
    <button type="button" className="btn secondary" disabled={busy} onClick={() => void create()}>
      {busy ? "Creating…" : "New collection"}
    </button>
  );
}
