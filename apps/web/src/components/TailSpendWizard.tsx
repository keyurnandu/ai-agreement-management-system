"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type CommType = { id: string; key: string; prefix: string; name: string };

export function TailSpendWizard() {
  const router = useRouter();
  const [porTypeId, setPorTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [message, setMessage] = useState("Please upload your order form or contract for review.");
  const [sendInvite, setSendInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/deals")
      .then((r) => r.json())
      .then((j) => {
        const types = (j as { types: CommType[] }).types ?? [];
        const por = types.find((t) => t.key === "por");
        if (por) setPorTypeId(por.id);
      });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!porTypeId || !title.trim() || !vendorEmail.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          direction: "ORG_BUYING",
          commercialTypeId: porTypeId,
          vendorEmail: vendorEmail.trim(),
          vendorName: vendorName.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      if (!r.ok) {
        setErr(((await r.json()) as { error?: string }).error ?? "Create failed");
        return;
      }
      const { id } = (await r.json()) as { id: string };
      if (sendInvite) {
        await fetch(`/api/deals/${id}/send-vendor`, { method: "POST" });
      }
      router.push(`/deals/${id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card grid" onSubmit={(e) => void submit(e)}>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Creates a standalone <strong>POR</strong> (no master/wrapper). Vendor gets a portal link to upload their paper.
        Optional contract authoring can be linked later from the deal page.
      </p>

      <label className="label">Order / deal title</label>
      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Q2 Office supplies PO" />

      <label className="label">Vendor email</label>
      <input className="input" type="email" value={vendorEmail} onChange={(e) => setVendorEmail(e.target.value)} required placeholder="vendor@company.com" />

      <label className="label">Vendor name</label>
      <input className="input" value={vendorName} onChange={(e) => setVendorName(e.target.value)} placeholder="Acme Supplies" />

      <label className="label">Message to vendor</label>
      <textarea className="input" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} />
        Email portal invite immediately (or copy link from deal page later)
      </label>

      {err ? <p className="error">{err}</p> : null}

      <button className="btn" type="submit" disabled={busy || !porTypeId}>
        {busy ? "Creating…" : "Create tail spend deal"}
      </button>
    </form>
  );
}
