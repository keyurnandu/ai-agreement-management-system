"use client";

import { useCallback, useEffect, useState } from "react";
import { RemoveButton } from "@/components/RemoveButton";

type CommType = {
  id: string;
  key: string;
  name: string;
  prefix: string;
  direction: string;
  domain: string;
  isRoot: boolean;
  description: string | null;
  system: boolean;
  allowedParentIds: string[];
  allowedChildIds: string[];
};

const DOMAINS = [
  { id: "DEAL", label: "Deals" },
  { id: "CONTRACT", label: "Contracts" },
  { id: "DOCUMENT", label: "Documents" },
] as const;

export function CommercialHierarchyAdmin() {
  const [domain, setDomain] = useState<(typeof DOMAINS)[number]["id"]>("DEAL");
  const [types, setTypes] = useState<CommType[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [linkParent, setLinkParent] = useState("");
  const [linkChild, setLinkChild] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/commercial-types?domain=${domain}`);
    if (r.ok) setTypes(((await r.json()) as { types: CommType[] }).types);
  }, [domain]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createType(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const parentIds = String(fd.get("parentTypeIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const r = await fetch("/api/commercial-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: fd.get("key"),
        name: fd.get("name"),
        prefix: fd.get("prefix"),
        direction: fd.get("direction"),
        domain,
        description: fd.get("description"),
        parentTypeIds: parentIds.length ? parentIds : undefined,
        isRoot: parentIds.length === 0,
      }),
    });
    setMsg(r.ok ? "Type created." : `Failed: ${((await r.json()) as { error?: string }).error}`);
    if (r.ok) {
      form.reset();
      await load();
    }
  }

  async function addLink() {
    if (!linkParent || !linkChild) return;
    const r = await fetch("/api/commercial-types/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ parentTypeId: linkParent, childTypeId: linkChild }),
    });
    setMsg(r.ok ? "Link added." : `Failed: ${((await r.json()) as { error?: string }).error}`);
    if (r.ok) await load();
  }

  return (
    <div className="card grid" style={{ marginBottom: 16 }}>
      <h2 style={{ margin: 0 }}>Commercial hierarchy types</h2>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        Define record types and parent→child links <strong>per area</strong> (Deals, Contracts, Documents stay separate).
      </p>
      <div className="row" style={{ gap: 8, justifyContent: "flex-start", flexWrap: "wrap" }}>
        {DOMAINS.map((d) => (
          <button
            key={d.id}
            type="button"
            className={domain === d.id ? "btn" : "btn secondary"}
            style={{ padding: "6px 12px", fontSize: 12 }}
            onClick={() => setDomain(d.id)}
          >
            {d.label}
          </button>
        ))}
      </div>
      {msg ? <p className="muted" style={{ fontSize: 12 }}>{msg}</p> : null}

      <div style={{ fontSize: 13 }}>
        <p className="label" style={{ marginBottom: 6 }}>
          Defined types
        </p>
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
          {types.map((t) => (
            <li key={t.id} style={{ marginBottom: 8, padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
              <strong>{t.prefix}</strong> — {t.name}
              <span className="muted"> · {t.direction === "ORG_SELLING" ? "Sales" : "Procurement"}</span>
              {t.isRoot ? <span className="pill" style={{ marginLeft: 6 }}>root</span> : null}
              {t.system ? <span className="pill" style={{ marginLeft: 4 }}>system</span> : null}
              {t.allowedParentIds.length ? (
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Can attach under:{" "}
                  {t.allowedParentIds
                    .map((pid) => types.find((x) => x.id === pid)?.prefix ?? pid)
                    .join(", ")}
                </div>
              ) : null}
              {t.allowedChildIds.length ? (
                <div className="muted" style={{ fontSize: 11 }}>
                  Can have children:{" "}
                  {t.allowedChildIds.map((cid) => types.find((x) => x.id === cid)?.prefix ?? cid).join(", ")}
                </div>
              ) : null}
              {!t.system ? (
                <RemoveButton
                  label="Deactivate"
                  confirmMessage={`Deactivate type ${t.prefix}?`}
                  onDelete={async () => {
                    const r = await fetch(`/api/commercial-types/${t.id}`, { method: "DELETE" });
                    if (r.ok) return { ok: true };
                    const j = (await r.json().catch(() => ({}))) as { error?: string };
                    return { ok: false, error: j.error ?? "failed" };
                  }}
                  onDone={() => void load()}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid" style={{ gap: 8 }}>
        <p className="label" style={{ margin: 0 }}>
          Add hierarchy link (parent → child)
        </p>
        <select className="input" value={linkParent} onChange={(e) => setLinkParent(e.target.value)}>
          <option value="">Parent type…</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.prefix} — {t.name}
            </option>
          ))}
        </select>
        <select className="input" value={linkChild} onChange={(e) => setLinkChild(e.target.value)}>
          <option value="">Child type…</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.prefix} — {t.name}
            </option>
          ))}
        </select>
        <button type="button" className="btn secondary" onClick={() => void addLink()}>
          Add link
        </button>
      </div>

      <form className="grid" onSubmit={createType} style={{ marginTop: 8 }}>
        <p className="label" style={{ margin: 0 }}>
          Create custom type
        </p>
        <input className="input" name="name" required placeholder="Amendment" />
        <input className="input" name="prefix" required placeholder="SAM" maxLength={8} />
        <input className="input" name="key" placeholder="sales_amendment (auto if empty)" />
        <select className="input" name="direction" defaultValue="ORG_SELLING">
          <option value="ORG_SELLING">Sales</option>
          <option value="ORG_BUYING">Procurement</option>
        </select>
        <input
          className="input"
          name="parentTypeIds"
          placeholder="Parent type IDs (comma-sep) — leave empty for root"
        />
        <input className="input" name="description" placeholder="Optional description" />
        <button type="submit" className="btn secondary">
          Create type
        </button>
      </form>
    </div>
  );
}
