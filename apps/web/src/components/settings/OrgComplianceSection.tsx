"use client";

import { useCallback, useEffect, useState } from "react";
import { RemoveButton } from "@/components/RemoveButton";
import { SettingsFlash } from "@/components/settings/OrgBrandingSection";

type RulePack = { id: string; name: string; direction: string; createdAt: string };

async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error === "forbidden") return "Permission denied — sign in as Manager or Admin.";
    return j.error ?? fallback;
  } catch {
    return fallback;
  }
}

function directionLabel(d: string) {
  return d === "ORG_BUYING" ? "Procurement" : "Sales";
}

export function OrgComplianceSection() {
  const [packs, setPacks] = useState<RulePack[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch("/api/rule-packs");
    if (r.ok) setPacks(((await r.json()) as { packs: RulePack[] }).packs ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadRules(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const rulesText = String(fd.get("rulesText") ?? "").trim();
    const file = fd.get("file");
    if (!rulesText && !(file instanceof File && file.size > 0)) {
      setMsg("Provide rules text or upload a rules PDF.");
      setMsgOk(false);
      return;
    }
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/rule-packs", { method: "POST", body: fd });
    setBusy(false);
    if (r.ok) {
      setMsg(`Rule pack "${name}" saved.`);
      setMsgOk(true);
      form.reset();
      await load();
    } else {
      setMsg(await apiError(r, "Rule pack upload failed."));
      setMsgOk(false);
    }
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Compliance rules</h2>
      <p className="lead">
        Upload standard terms per direction — used when you run compliance checks on sales or procurement deals.
      </p>
      <SettingsFlash message={msg} ok={msgOk} />
      <form className="card grid" onSubmit={uploadRules}>
        <label className="label">Pack name</label>
        <input className="input" name="name" required placeholder="Adobe procurement T&amp;C 2026" />
        <label className="label">Direction</label>
        <select className="input" name="direction" defaultValue="ORG_BUYING">
          <option value="ORG_BUYING">Procurement — vendor paper</option>
          <option value="ORG_SELLING">Sales — customer paper</option>
        </select>
        <label className="label">Rules PDF (optional — text extracted automatically)</label>
        <input className="input" name="file" type="file" accept="application/pdf" />
        <label className="label">Or paste rules</label>
        <textarea className="input" name="rulesText" rows={5} placeholder="Liability cap must not exceed…" />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload rule pack"}
        </button>
        {packs.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            <p className="label" style={{ marginBottom: 6 }}>
              Uploaded rule packs ({packs.length})
            </p>
            <ul className="settings-list">
              {packs.map((p) => (
                <li key={p.id}>
                  <span>
                    <strong>{p.name}</strong>
                    <span className="muted"> · {directionLabel(p.direction)}</span>
                  </span>
                  <RemoveButton
                    label="Remove"
                    confirmMessage={`Remove rule pack "${p.name}"? Existing deals that used it are kept.`}
                    onDelete={async () => {
                      const r = await fetch(`/api/rule-packs/${p.id}`, { method: "DELETE" });
                      if (r.ok) return { ok: true };
                      const j = (await r.json().catch(() => ({}))) as { error?: string };
                      return { ok: false, error: j.error ?? `Error ${r.status}` };
                    }}
                    onDone={() => void load()}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No rule packs yet.
          </p>
        )}
      </form>
    </>
  );
}
