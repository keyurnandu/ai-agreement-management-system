"use client";

import { useCallback, useEffect, useState } from "react";
import { SignaturePad } from "@/components/SignaturePad";

type Field = {
  id: string;
  type: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
  value: string | null;
};
type Payload = {
  agreementTitle: string;
  documentTitle: string;
  message: string | null;
  recipient: { email: string; name: string | null; role: string };
  myTurn: boolean;
  alreadySigned: boolean;
  agreementStatus: string;
  pageCount: number;
  fields: Field[];
};

export function SigningCeremony({ token }: { token: string }) {
  const [p, setP] = useState<Payload | null>(null);
  const [page, setPage] = useState(1);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ completed: boolean } | null>(null);
  const [declined, setDeclined] = useState(false);
  const [padField, setPadField] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sign/${token}`);
    if (res.ok) {
      const j = (await res.json()) as Payload;
      setP(j);
      const init: Record<string, string> = {};
      for (const f of j.fields) {
        if (f.value) init[f.id] = f.value;
        else if (f.type === "DATE") init[f.id] = new Date().toISOString().slice(0, 10);
      }
      setValues(init);
    } else {
      setErr("This signing link is invalid or has expired.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err && !p) return <div className="card" style={{ marginTop: 40 }}><p className="error">{err}</p></div>;
  if (!p) return <p className="muted">Loading…</p>;
  if (declined)
    return (
      <div className="card" style={{ marginTop: 40 }}>
        <h1>Declined</h1>
        <p className="muted">You have declined to sign this document. The sender has been notified.</p>
      </div>
    );
  if (done)
    return (
      <div className="card" style={{ marginTop: 40 }}>
        <h1>Thank you</h1>
        <p className="muted">
          Your signature has been recorded{done.completed ? ", and the agreement is now complete" : ""}.
        </p>
      </div>
    );
  if (p.alreadySigned)
    return (
      <div className="card" style={{ marginTop: 40 }}>
        <h1>{p.agreementTitle}</h1>
        <p className="muted">You have already signed this document.</p>
      </div>
    );
  if (!p.myTurn)
    return (
      <div className="card" style={{ marginTop: 40 }}>
        <h1>{p.agreementTitle}</h1>
        <p className="muted">
          It is not your turn to sign yet — you will be able to sign once earlier recipients have completed.
        </p>
      </div>
    );

  const pageFields = p.fields.filter((f) => f.page === page);

  async function submit() {
    for (const f of p!.fields) {
      if (f.required && !(values[f.id] ?? "").trim()) {
        setErr(`Please complete the ${f.type.toLowerCase()} field on page ${f.page}.`);
        setPage(f.page);
        return;
      }
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sign/${token}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values }),
      });
      if (res.ok) setDone((await res.json()) as { completed: boolean });
      else setErr(((await res.json()) as { error?: string }).error ?? "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    const reason = window.prompt("Reason for declining (optional):");
    if (reason === null) return; // cancelled
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sign/${token}/decline`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) setDeclined(true);
      else setErr(((await res.json()) as { error?: string }).error ?? "Could not decline.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="row" style={{ margin: "16px 0" }}>
        <div>
          <span className="brand">contract-platform</span>
          <h1 style={{ margin: "4px 0 2px" }}>{p.agreementTitle}</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            Signing as {p.recipient.email} · {p.fields.length} field(s) to complete
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn secondary" disabled={busy} onClick={decline}>
            Decline
          </button>
          <button className="btn" disabled={busy} onClick={submit}>
            {busy ? "Submitting…" : "Finish & sign"}
          </button>
        </div>
      </div>
      {p.message ? (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="muted" style={{ fontSize: 13 }}>{p.message}</p>
        </div>
      ) : null}
      {err ? <p className="error" style={{ marginBottom: 12 }}>{err}</p> : null}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn secondary" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
              ‹
            </button>
            <span className="muted">page {page} / {p.pageCount}</span>
            <button className="btn secondary" disabled={page >= p.pageCount} onClick={() => setPage((v) => v + 1)}>
              ›
            </button>
          </div>
          <span className="muted" style={{ fontSize: 12 }}>
            {pageFields.length} field(s) on this page
          </span>
        </div>
        <div style={{ padding: 16, background: "#0a0e15", textAlign: "center" }}>
          <div style={{ position: "relative", display: "inline-block", lineHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/sign/${token}/render?page=${page}&dpi=140`}
              alt={`page ${page}`}
              style={{ display: "block", maxWidth: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
            />
            {pageFields.map((f) => {
              const v = values[f.id] ?? "";
              const isImg = v.startsWith("data:image");
              const box = {
                position: "absolute" as const,
                left: `${f.x * 100}%`,
                top: `${f.y * 100}%`,
                width: `${f.width * 100}%`,
                height: `${f.height * 100}%`,
              };
              const drawBtn = (label: string) => (
                <button
                  type="button"
                  onClick={() => setPadField(f.id)}
                  style={{
                    position: "absolute",
                    top: -16,
                    right: 0,
                    fontSize: 10,
                    background: "var(--panel-2)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    cursor: "pointer",
                    padding: "0 5px",
                  }}
                >
                  {label}
                </button>
              );
              if (f.type === "SIGNATURE" && isImg) {
                return (
                  <div key={f.id} style={{ ...box, border: "1.5px solid #b8860b", background: "#fff", borderRadius: 4 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={v} alt="signature" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                    {drawBtn("✎ redo")}
                  </div>
                );
              }
              return (
                <div key={f.id} style={box}>
                  <input
                    type={f.type === "DATE" ? "date" : "text"}
                    className={`sigfield${f.type === "SIGNATURE" ? " sig" : ""}`}
                    value={v}
                    placeholder={f.type === "SIGNATURE" ? "Type name to sign" : f.type === "INITIAL" ? "Initials" : f.type}
                    onChange={(e) => setValues((s) => ({ ...s, [f.id]: e.target.value }))}
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                  />
                  {f.type === "SIGNATURE" ? drawBtn("✎ draw") : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {padField ? (
        <SignaturePad
          onClose={() => setPadField(null)}
          onApply={(d) => {
            setValues((s) => (padField ? { ...s, [padField]: d } : s));
            setPadField(null);
          }}
        />
      ) : null}
    </div>
  );
}
