"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { agreementSendReadiness } from "@/lib/signature-layout";
import { withReturnTo } from "@/lib/record-nav";

type AgreementData = {
  id: string;
  title: string;
  status: string;
  routingType: string;
  recipients: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    routingOrder: number;
    status: string;
    signedAt: string | null;
    token: string | null;
  }[];
  fields: {
    id: string;
    recipientId: string | null;
    type: string;
    label: string | null;
    required: boolean;
  }[];
};

export function DealSigningPanel({
  agreementId,
  dealId,
  onUpdate,
}: {
  agreementId: string;
  dealId: string;
  onUpdate?: () => void;
}) {
  const [data, setData] = useState<AgreementData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const load = useCallback(async () => {
    const res = await fetch(`/api/agreements/${agreementId}`);
    if (res.ok) setData(await res.json());
  }, [agreementId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="muted" style={{ fontSize: 13 }}>Loading signing…</p>;

  const isDraft = data.status === "DRAFT";
  const canVoid = ["SENT", "IN_PROGRESS", "COMPLETED"].includes(data.status);
  const { ready, blocker, signers } = agreementSendReadiness(data.recipients, data.fields);
  const signedCount = data.recipients.filter((r) => r.status === "SIGNED").length;
  const signerCount = data.recipients.filter((r) => r.role !== "CC").length;

  async function autoPlace() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/agreements/${agreementId}/fields/auto`, { method: "POST" });
      if (res.ok) {
        await load();
        setMsg("Signature blocks placed on the document.");
      } else {
        setMsg(((await res.json()) as { error?: string }).error ?? "Auto-place failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/agreements/${agreementId}/send`, { method: "POST" });
      if (res.ok) {
        await load();
        onUpdate?.();
        setMsg("Sent for signature — signers receive email with signing links.");
      } else {
        setMsg(((await res.json()) as { error?: string }).error ?? "Send failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remind() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/agreements/${agreementId}/remind`, { method: "POST" });
      if (res.ok) {
        const j = (await res.json()) as { reminded: number };
        setMsg(`Reminder sent to ${j.reminded} outstanding signer(s).`);
      } else {
        setMsg(((await res.json()) as { error?: string }).error ?? "Reminder failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function voidAgreement() {
    if (
      !window.confirm(
        `Void "${data?.title}"? Signing links will stop working. You can delete this deal afterward.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/agreements/${agreementId}/void`, { method: "POST", body: "{}" });
      if (res.ok) {
        await load();
        onUpdate?.();
        setMsg("Agreement voided. You can now delete this deal.");
      } else {
        setMsg(((await res.json()) as { error?: string }).error ?? "Void failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function copyLink(token: string) {
    void navigator.clipboard.writeText(`${origin}/sign/${token}`);
    setMsg("Signing link copied.");
  }

  return (
    <div className="card" style={{ borderColor: "rgba(79,140,255,0.35)" }}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 4 }}>E-sign</h2>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {data.status} · {data.routingType.toLowerCase()} routing
          </p>
        </div>
        <Link
          className="btn secondary"
          style={{ fontSize: 12, padding: "6px 10px" }}
          href={withReturnTo(`/agreements/${agreementId}`, `/deals/${dealId}`)}
        >
          Advanced editor
        </Link>
      </div>

      <ul style={{ margin: "12px 0", paddingLeft: 0, listStyle: "none", fontSize: 13 }}>
        {data.recipients.map((r) => (
          <li
            key={r.id}
            style={{
              padding: "8px 0",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              <strong>{r.email}</strong>
              <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                {r.role} · {r.status}
                {r.signedAt ? ` · signed ${new Date(r.signedAt).toLocaleDateString()}` : ""}
              </span>
            </span>
            {r.token && r.role !== "CC" ? (
              <button type="button" className="btn secondary" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => copyLink(r.token!)}>
                Copy sign link
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {isDraft ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {!ready ? (
            <button type="button" className="btn secondary" disabled={busy || signers.length === 0} onClick={() => void autoPlace()}>
              Place signature blocks
            </button>
          ) : null}
          <button type="button" className="btn" disabled={busy || !ready} onClick={() => void send()} title={blocker ?? undefined}>
            Send for signature
          </button>
          {!ready && blocker ? (
            <span className="muted" style={{ fontSize: 12 }}>{blocker}</span>
          ) : (
            <span style={{ fontSize: 12, color: "var(--green)" }}>Ready to send</span>
          )}
        </div>
      ) : (
        <div>
          <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
            {signedCount} of {signerCount} signed
            {data.status === "COMPLETED" ? " — deal will mark complete when all parties finish." : ""}
          </p>
          {(data.status === "SENT" || data.status === "IN_PROGRESS") && signedCount < signerCount ? (
            <button type="button" className="btn secondary" disabled={busy} onClick={() => void remind()}>
              Send reminder
            </button>
          ) : null}
          {data.status === "COMPLETED" ? (
            <p style={{ color: "var(--green)", fontSize: 13, margin: "8px 0 0" }}>Signing complete.</p>
          ) : null}
          {data.status === "VOIDED" ? (
            <p style={{ color: "var(--red)", fontSize: 13, margin: "8px 0 0" }}>Agreement voided.</p>
          ) : null}
          {canVoid ? (
            <button
              type="button"
              className="btn secondary"
              style={{ marginTop: 8 }}
              disabled={busy}
              onClick={() => void voidAgreement()}
            >
              Void agreement
            </button>
          ) : null}
        </div>
      )}

      {msg ? <p className="muted" style={{ fontSize: 12, marginTop: 10, marginBottom: 0 }}>{msg}</p> : null}
    </div>
  );
}
