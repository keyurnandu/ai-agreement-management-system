"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RemoveButton } from "@/components/RemoveButton";

type DocRow = {
  id: string;
  title: string;
  ownerEmail: string;
  pageCount: number | string;
  version: number;
  updatedAt: string;
};

export function DocumentsTable({ docs }: { docs: DocRow[] }) {
  const router = useRouter();

  if (docs.length === 0) {
    return (
      <div className="card">
        <p className="muted">No documents yet. Upload a PDF to get started.</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
            <th style={{ padding: "12px 16px" }}>Title</th>
            <th style={{ padding: "12px 16px" }}>Owner</th>
            <th style={{ padding: "12px 16px" }}>Pages</th>
            <th style={{ padding: "12px 16px" }}>Version</th>
            <th style={{ padding: "12px 16px" }}>Updated</th>
            <th style={{ padding: "12px 16px" }} />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "12px 16px" }}>
                <Link href={`/documents/${d.id}`}>{d.title}</Link>
              </td>
              <td style={{ padding: "12px 16px" }} className="muted">
                {d.ownerEmail}
              </td>
              <td style={{ padding: "12px 16px" }} className="muted">
                {d.pageCount}
              </td>
              <td style={{ padding: "12px 16px" }} className="muted">
                v{d.version}
              </td>
              <td style={{ padding: "12px 16px" }} className="muted">
                {d.updatedAt}
              </td>
              <td style={{ padding: "12px 16px", textAlign: "right" }}>
                <RemoveButton
                  label="Delete"
                  confirmMessage={`Delete document "${d.title}"? Linked deals or agreements must be removed first.`}
                  onDelete={async () => {
                    const r = await fetch(`/api/documents/${d.id}`, { method: "DELETE" });
                    if (r.ok) return { ok: true };
                    const j = (await r.json().catch(() => ({}))) as { error?: string };
                    return { ok: false, error: j.error ?? `Error ${r.status}` };
                  }}
                  onDone={() => router.refresh()}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
