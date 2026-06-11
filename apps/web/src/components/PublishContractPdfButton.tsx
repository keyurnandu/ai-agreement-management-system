"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PublishContractPdfButton({
  dealId,
  contractId,
  needsPublish,
}: {
  dealId: string;
  contractId: string | null;
  needsPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!contractId || !needsPublish) return null;

  async function publish() {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/deals/${dealId}/publish-contract`, { method: "POST" });
    setBusy(false);
    if (r.ok) router.refresh();
    else setErr(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not generate PDF");
  }

  return (
    <div className="card" style={{ borderColor: "rgba(96,165,250,0.35)", fontSize: 13, marginBottom: 12 }}>
      <strong>PDF not generated from contract yet</strong>
      <p className="muted" style={{ margin: "6px 0 10px" }}>
        The Deal tab shows the negotiation PDF. Your clause content is on the <strong>Contract</strong> tab — click below
        to render it into this document.
      </p>
      <button type="button" className="btn" disabled={busy} onClick={() => void publish()}>
        {busy ? "Generating…" : "Generate PDF from contract"}
      </button>
      {err ? <p className="error" style={{ marginTop: 8 }}>{err}</p> : null}
    </div>
  );
}
