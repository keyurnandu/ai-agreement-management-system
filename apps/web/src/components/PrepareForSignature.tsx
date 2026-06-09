"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PrepareForSignature({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      const res = await fetch("/api/agreements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      if (res.ok) {
        const j = (await res.json()) as { id: string };
        router.push(`/agreements/${j.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn" disabled={busy} onClick={go}>
      {busy ? "…" : "Prepare for signature"}
    </button>
  );
}
