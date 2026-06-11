"use client";

import { useCallback, useEffect, useState } from "react";
import { RemoveButton } from "@/components/RemoveButton";
import { SettingsFlash } from "@/components/settings/OrgBrandingSection";

type FileTpl = { id: string; name: string; direction: string; createdAt: string };

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

export function OrgTemplatesSection() {
  const [templates, setTemplates] = useState<FileTpl[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgOk, setMsgOk] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch("/api/templates/file");
    if (r.ok) setTemplates(((await r.json()) as { templates: FileTpl[] }).templates ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadTemplate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/templates/file", { method: "POST", body: fd });
    setBusy(false);
    if (r.ok) {
      setMsg(`Template "${name || "uploaded"}" saved.`);
      setMsgOk(true);
      form.reset();
      await load();
    } else {
      setMsg(await apiError(r, "Template upload failed."));
      setMsgOk(false);
    }
  }

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Deal templates</h2>
      <p className="lead">Upload PDF or Word (.docx) templates used when creating new sales or procurement deals.</p>
      <SettingsFlash message={msg} ok={msgOk} />
      <form className="card grid" onSubmit={uploadTemplate}>
        <label className="label">Template name</label>
        <input className="input" name="name" required placeholder="Standard Order Form" />
        <label className="label">Direction</label>
        <select className="input" name="direction" defaultValue="ORG_SELLING">
          <option value="ORG_SELLING">Sales — outbound to customer</option>
          <option value="ORG_BUYING">Procurement — inbound from vendor</option>
        </select>
        <label className="label">PDF or Word (.docx)</label>
        <input
          className="input"
          name="file"
          type="file"
          accept="application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          required
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Uploading…" : "Upload template"}
        </button>
        {templates.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            <p className="label" style={{ marginBottom: 6 }}>
              Uploaded templates ({templates.length})
            </p>
            <ul className="settings-list">
              {templates.map((t) => (
                <li key={t.id}>
                  <span>
                    <strong>{t.name}</strong>
                    <span className="muted"> · {directionLabel(t.direction)}</span>
                  </span>
                  <RemoveButton
                    label="Remove"
                    confirmMessage={`Remove template "${t.name}"? Existing deals that used it are kept.`}
                    onDelete={async () => {
                      const r = await fetch(`/api/templates/file/${t.id}`, { method: "DELETE" });
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
            No templates yet — upload one to create deals from a standard document.
          </p>
        )}
      </form>
    </>
  );
}
