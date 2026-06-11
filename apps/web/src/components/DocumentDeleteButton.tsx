"use client";

import { useRouter } from "next/navigation";
import { RemoveButton } from "@/components/RemoveButton";

export function DocumentDeleteButton({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter();

  return (
    <RemoveButton
      label="Delete document"
      confirmMessage={`Delete "${title}"? Remove linked deals or agreements first if delete is blocked.`}
      onDelete={async () => {
        const r = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
        if (r.ok) return { ok: true };
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        return { ok: false, error: j.error ?? `Error ${r.status}` };
      }}
      onDone={() => router.push("/documents")}
    />
  );
}
