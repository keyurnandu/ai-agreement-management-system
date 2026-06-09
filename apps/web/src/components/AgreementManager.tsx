"use client";

import { useCallback, useEffect, useState, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";

type Recipient = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  routingOrder: number;
  status: string;
  signedAt: string | null;
  token: string | null;
};
type Field = {
  id: string;
  recipientId: string | null;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
};
type Data = {
  id: string;
  title: string;
  status: string;
  routingType: string;
  documentId: string;
  documentTitle: string;
  pageCount: number;
  recipients: Recipient[];
  fields: Field[];
};

const FIELD_TYPES = ["SIGNATURE", "INITIAL", "DATE", "TEXT"];
const DEFAULT_SIZE: Record<string, { w: number; h: number }> = {
  SIGNATURE: { w: 0.28, h: 0.05 },
  INITIAL: { w: 0.1, h: 0.04 },
  DATE: { w: 0.18, h: 0.035 },
  TEXT: { w: 0.25, h: 0.035 },
};
const COLORS = ["#4f8cff", "#34d399", "#fbbf24", "#f472b6", "#a78bfa"];

export function AgreementManager({ agreementId }: { agreementId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1);
  const [recipientId, setRecipientId] = useState("");
  const [fieldType, setFieldType] = useState("SIGNATURE");
  const [placeMode, setPlaceMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [rrole, setRrole] = useState("SIGNER");
  const [expiryDays, setExpiryDays] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/agreements/${agreementId}`);
    if (res.ok) {
      const j = (await res.json()) as Data;
      setData(j);
      setRecipientId((cur) => cur || j.recipients[0]?.id || "");
    }
  }, [agreementId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="muted">Loading…</p>;
  const isDraft = data.status === "DRAFT";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  async function addRecipient() {
    if (!email.trim() || !data) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/agreements/${agreementId}/recipients`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, name, role: rrole, routingOrder: data.recipients.length + 1 }),
      });
      if (res.ok) {
        setEmail("");
        setName("");
        await load();
      } else {
        setMsg(((await res.json()) as { error?: string }).error ?? "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPlace(e: MouseEvent<HTMLDivElement>) {
    if (!placeMode || !recipientId) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const size = DEFAULT_SIZE[fieldType] ?? { w: 0.25, h: 0.04 };
    setBusy(true);
    try {
      const res = await fetch(`/api/agreements/${agreementId}/fields`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientId, type: fieldType, page, x, y, width: size.w, height: size.h }),
      });
      if (res.ok) await load();
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/agreements/${agreementId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (res.ok) await load();
      else setMsg(((await res.json()) as { error?: string }).error ?? "error");
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/agreements/${agreementId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
      else setMsg(((await res.json()) as { error?: string }).error ?? "error");
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
        setMsg(`Reminder recorded for ${j.reminded} outstanding recipient(s).`);
      } else {
        setMsg(((await res.json()) as { error?: string }).error ?? "error");
      }
    } finally {
      setBusy(false);
    }
  }

  const recipIndex = (rid: string | null) => data.recipients.findIndex((r) => r.id === rid);
  const recipColor = (rid: string | null) => COLORS[(Math.max(0, recipIndex(rid)) % COLORS.length)];
  const pageFields = data.fields.filter((f) => f.page === page);
  const tb: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" };

  return (
    <div>
      <div className="row" style={{ margin: "8px 0 18px" }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{data.title}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {data.status} · {data.routingType.toLowerCase()} routing ·{" "}
            <Link href={`/documents/${data.documentId}`}>{data.documentTitle}</Link>
          </p>
        </div>
        {isDraft ? (
          <button className="btn" disabled={busy} onClick={send}>
            Send for signature
          </button>
        ) : (
          <Link href={`/documents/${data.documentId}`} className="btn secondary">
            View document
          </Link>
        )}
      </div>
      {msg ? <p className="error" style={{ marginBottom: 12 }}>{msg}</p> : null}

      <div className="grid" style={{ gridTemplateColumns: "1fr 320px", gap: 16, alignItems: "start" }}>
        {/* Document with field overlay */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row" style={{ padding: 12, borderBottom: "1px solid var(--border)", ...tb }}>
            <div style={tb}>
              <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹
              </button>
              <span className="muted">
                page {page} / {data.pageCount}
              </span>
              <button
                className="btn secondary"
                disabled={page >= data.pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                ›
              </button>
            </div>
            {isDraft ? (
              <button
                className={placeMode ? "btn" : "btn secondary"}
                disabled={!recipientId}
                onClick={() => setPlaceMode((v) => !v)}
              >
                {placeMode ? "Placing… (click page)" : "Place field"}
              </button>
            ) : null}
          </div>
          <div style={{ padding: 16, background: "#0a0e15", textAlign: "center" }}>
            <div
              onClick={onPlace}
              style={{
                position: "relative",
                display: "inline-block",
                lineHeight: 0,
                cursor: placeMode ? "crosshair" : "default",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/documents/${data.documentId}/render?page=${page}&dpi=130`}
                alt={`page ${page}`}
                style={{ display: "block", maxWidth: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
              />
              {pageFields.map((f) => (
                <div
                  key={f.id}
                  className="fieldtag"
                  title={`${f.type} · ${data.recipients[recipIndex(f.recipientId)]?.email ?? "?"}`}
                  style={{
                    left: `${f.x * 100}%`,
                    top: `${f.y * 100}%`,
                    width: `${f.width * 100}%`,
                    height: `${f.height * 100}%`,
                    background: `${recipColor(f.recipientId)}cc`,
                    border: `1px solid ${recipColor(f.recipientId)}`,
                  }}
                >
                  {f.type}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recipients / fields / links */}
        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <h2>Recipients</h2>
            <div className="grid" style={{ gap: 8 }}>
              {data.recipients.length === 0 ? <p className="muted">None yet.</p> : null}
              {data.recipients.map((r) => {
                const count = data.fields.filter((f) => f.recipientId === r.id).length;
                return (
                  <div key={r.id} className="row" style={{ alignItems: "flex-start" }}>
                    <div>
                      <span className="dot" style={{ background: recipColor(r.id), display: "inline-block", marginRight: 6 }} />
                      <strong style={{ fontSize: 13 }}>{r.email}</strong>
                      <div className="muted" style={{ fontSize: 11 }}>
                        {r.role} · order {r.routingOrder} · {r.status} · {count} field(s)
                      </div>
                      {!isDraft && r.token ? (
                        <div style={{ marginTop: 4 }}>
                          <a href={`${origin}/sign/${r.token}`} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                            signing link ↗
                          </a>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {isDraft ? (
              <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                <input className="input" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="input" placeholder="name (optional)" value={name} onChange={(e) => setName(e.target.value)} style={{ marginTop: 6 }} />
                <select className="input" value={rrole} onChange={(e) => setRrole(e.target.value)} style={{ marginTop: 6 }}>
                  <option value="SIGNER">Signer</option>
                  <option value="APPROVER">Approver</option>
                  <option value="CC">CC</option>
                </select>
                <button className="btn secondary" disabled={busy || !email.trim()} onClick={addRecipient} style={{ width: "100%", marginTop: 8 }}>
                  Add recipient
                </button>
              </div>
            ) : null}
          </div>

          {isDraft ? (
            <>
              <div className="card">
                <h2>Field to place</h2>
                <label className="label" style={{ marginTop: 0 }}>
                  Recipient
                </label>
                <select className="input" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
                  {data.recipients.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.email}
                    </option>
                  ))}
                </select>
                <label className="label">Type</label>
                <select className="input" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
                  Click <strong>Place field</strong>, then click on the page to drop it. Each signer needs at
                  least one field before you can send.
                </p>
              </div>

              <div className="card">
                <h2>Settings</h2>
                <label className="label" style={{ marginTop: 0 }}>
                  Routing
                </label>
                <select
                  className="input"
                  value={data.routingType}
                  onChange={(e) => patch({ routingType: e.target.value })}
                >
                  <option value="SEQUENTIAL">Sequential (one after another)</option>
                  <option value="PARALLEL">Parallel (everyone at once)</option>
                </select>
                <label className="label">Expire after (days · 0 = never)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    placeholder="e.g. 14"
                  />
                  <button
                    className="btn secondary"
                    disabled={busy || expiryDays === ""}
                    onClick={() => patch({ expiresInDays: Number(expiryDays) })}
                  >
                    Set
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <h2>Progress</h2>
              <p className="muted" style={{ fontSize: 13 }}>
                {data.recipients.filter((r) => r.status === "SIGNED").length} of{" "}
                {data.recipients.filter((r) => r.role !== "CC").length} signed.
              </p>
              {data.status === "COMPLETED" ? (
                <p style={{ color: "var(--green)", fontSize: 13 }}>✓ Completed — signed PDF saved as a new version.</p>
              ) : null}
              {data.status === "DECLINED" ? (
                <p style={{ color: "var(--red)", fontSize: 13 }}>✕ Declined by a recipient.</p>
              ) : null}
              {data.status === "EXPIRED" ? (
                <p style={{ color: "var(--red)", fontSize: 13 }}>⏱ Expired.</p>
              ) : null}
              {data.status === "SENT" || data.status === "IN_PROGRESS" ? (
                <button className="btn secondary" disabled={busy} onClick={remind} style={{ marginTop: 10 }}>
                  Send reminder
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
