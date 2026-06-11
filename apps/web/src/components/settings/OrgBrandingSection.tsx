"use client";

import { useEffect, useState } from "react";

export function SettingsFlash({ message, ok }: { message: string | null; ok: boolean }) {
  if (!message) return null;
  return (
    <p
      className="settings-flash"
      style={{
        borderColor: ok ? "var(--green)" : "var(--red)",
        background: ok ? "rgba(52, 211, 153, 0.12)" : "rgba(248, 113, 113, 0.12)",
      }}
    >
      {message}
    </p>
  );
}

export function OrgBrandingSection() {
  const [orgName, setOrgName] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(true);

  useEffect(() => {
    void fetch("/api/org/settings")
      .then((r) => r.json())
      .then((j) => {
        const o = (j as { org: { orgName: string; headerText: string | null; footerText: string | null } }).org;
        setOrgName(o.orgName);
        setHeaderText(o.headerText ?? "");
        setFooterText(o.footerText ?? "");
      });
  }, []);

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/org/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orgName, headerText, footerText }),
    });
    setMsg("Organization settings saved.");
    setMsgOk(true);
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Organization</h2>
      <p className="lead">
        Branding is applied when generating contract PDFs and when creating deals from uploaded templates.
      </p>
      <SettingsFlash message={msg} ok={msgOk} />
      <form className="card grid" onSubmit={saveOrg}>
        <label className="label">Organization name</label>
        <input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
        <label className="label">Header text (every page)</label>
        <input
          className="input"
          value={headerText}
          onChange={(e) => setHeaderText(e.target.value)}
          placeholder="Confidential · Your Organization"
        />
        <label className="label">Footer text (every page)</label>
        <input
          className="input"
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          placeholder="© 2026 Your Org · Page {n}"
        />
        <button className="btn" type="submit">
          Save branding
        </button>
      </form>
    </>
  );
}
