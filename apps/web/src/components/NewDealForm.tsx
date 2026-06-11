"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type FileTpl = { id: string; name: string; direction: string };
type RulePack = { id: string; name: string; direction: string };
type CommType = {
  id: string;
  key: string;
  name: string;
  prefix: string;
  direction: string;
  isRoot: boolean;
  allowedParentIds: string[];
};
type ParentCandidate = {
  id: string;
  commercialId: string | null;
  title: string;
  direction: string;
  commercialTypeId: string | null;
  typePrefix: string | null;
  vendorEmail: string;
  vendorName: string | null;
};

export function NewDealForm({
  parentId,
  typeId,
  direction: directionProp,
}: {
  parentId?: string;
  typeId?: string;
  direction?: "ORG_SELLING" | "ORG_BUYING";
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<FileTpl[]>([]);
  const [packs, setPacks] = useState<RulePack[]>([]);
  const [types, setTypes] = useState<CommType[]>([]);
  const [parents, setParents] = useState<ParentCandidate[]>([]);
  const [direction, setDirection] = useState<"ORG_SELLING" | "ORG_BUYING">(
    directionProp ?? "ORG_SELLING",
  );
  const [commercialTypeId, setCommercialTypeId] = useState(typeId ?? "");
  const [parentDealId, setParentDealId] = useState(parentId ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/rule-packs?direction=${direction}`)
      .then((r) => r.json())
      .then((j) => setPacks((j as { packs: RulePack[] }).packs ?? []));
  }, [direction]);

  useEffect(() => {
    void fetch("/api/templates/file")
      .then((r) => r.json())
      .then((j) => setTemplates((j as { templates: FileTpl[] }).templates ?? []));
    void fetch("/api/deals")
      .then((r) => r.json())
      .then((j) => {
        const data = j as { types: CommType[]; parentCandidates: ParentCandidate[] };
        setTypes(data.types ?? []);
        setParents(data.parentCandidates ?? []);
        if (parentId) {
          const p = data.parentCandidates?.find((x) => x.id === parentId);
          if (p) {
            setDirection(p.direction as "ORG_SELLING" | "ORG_BUYING");
            setParentDealId(parentId);
          }
        }
      });
  }, [parentId]);

  useEffect(() => {
    if (parentId) return;
    if (!directionProp) return;
    setDirection(directionProp);
    setCommercialTypeId((current) => {
      if (!current) return current;
      const t = types.find((x) => x.id === current);
      return t && t.direction !== directionProp ? "" : current;
    });
  }, [directionProp, parentId, types]);

  const filteredTypes = types.filter((t) => t.direction === direction);
  const selectedType = types.find((t) => t.id === commercialTypeId);

  const idPreview = selectedType ? `${selectedType.prefix}-n` : "Select type…";

  const parentOptions = useMemo(() => {
    if (!selectedType?.allowedParentIds.length) return [];
    return parents.filter(
      (p) =>
        p.direction === direction &&
        p.commercialTypeId &&
        selectedType.allowedParentIds.includes(p.commercialTypeId),
    );
  }, [parents, selectedType, direction]);

  const selectedParent = parentOptions.find((p) => p.id === parentDealId);
  const supportsParent = (selectedType?.allowedParentIds.length ?? 0) > 0;

  useEffect(() => {
    if (parentId && types.length) {
      const parent = parents.find((p) => p.id === parentId);
      if (parent) {
        if (typeId && !commercialTypeId) {
          setCommercialTypeId(typeId);
          return;
        }
        const candidates = types.filter(
          (t) =>
            t.direction === parent.direction &&
            t.allowedParentIds.includes(parent.commercialTypeId ?? "") &&
            !t.isRoot,
        );
        const preferred = candidates.find((t) => !["pam", "sam"].includes(t.key)) ?? candidates[0];
        if (preferred && !commercialTypeId) setCommercialTypeId(preferred.id);
      }
    }
  }, [parentId, typeId, types, parents, commercialTypeId]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!commercialTypeId) return;
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      title: String(fd.get("title") ?? ""),
      direction,
      commercialTypeId,
      parentDealId: parentDealId || undefined,
      vendorEmail: String(fd.get("vendorEmail") ?? ""),
      vendorName: String(fd.get("vendorName") ?? ""),
      fileTemplateId: String(fd.get("fileTemplateId") ?? "") || undefined,
      rulePackId: String(fd.get("rulePackId") ?? "") || undefined,
      message: String(fd.get("message") ?? ""),
    };
    const r = await fetch("/api/deals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (r.ok) {
      const j = (await r.json()) as { id: string };
      router.push(`/deals/${j.id}`);
    }
  }

  return (
    <form className="card grid" onSubmit={onSubmit}>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        Next ID: <strong>{idPreview}</strong>
      </p>

      <label className="label">Direction</label>
      <select
        className="input"
        value={direction}
        onChange={(e) => {
          setDirection(e.target.value as "ORG_SELLING" | "ORG_BUYING");
          setCommercialTypeId("");
          setParentDealId("");
        }}
      >
        <option value="ORG_SELLING">Sales</option>
        <option value="ORG_BUYING">Procurement</option>
      </select>

      <label className="label">Record type</label>
      <select
        className="input"
        value={commercialTypeId}
        required
        onChange={(e) => {
          setCommercialTypeId(e.target.value);
          setParentDealId("");
        }}
      >
        <option value="">Select type…</option>
        {filteredTypes.map((t) => (
          <option key={t.id} value={t.id}>
            {t.prefix} — {t.name}
            {t.isRoot ? " (master)" : ""}
          </option>
        ))}
      </select>

      {supportsParent && selectedType ? (
        <>
          <label className="label">Link to parent (optional)</label>
          <select className="input" value={parentDealId} onChange={(e) => setParentDealId(e.target.value)}>
            <option value="">None — standalone {selectedType.prefix}</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.commercialId ?? p.title} ({p.typePrefix})
              </option>
            ))}
          </select>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {selectedType.key === "por" || selectedType.key === "sor"
              ? "Tail spend: leave blank for a one-off order. Link to PCW/SCW when this order sits under an existing framework."
              : selectedType.key === "pcw" || selectedType.key === "scw"
                ? "Leave blank for a standalone wrapper, or link under the master (PMCW/SMCW) for a full hierarchy."
                : "Link when this record continues an existing commercial relationship; leave blank for a standalone deal."}
          </p>
          {selectedParent ? (
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              Counterparty from parent: {selectedParent.vendorEmail}
            </p>
          ) : null}
        </>
      ) : null}

      <label className="label">Title</label>
      <input className="input" name="title" required placeholder="Q1 Enterprise Order" />

      <label className="label">Counterparty email</label>
      <input
        className="input"
        name="vendorEmail"
        type="email"
        required={!selectedParent}
        defaultValue={selectedParent?.vendorEmail ?? ""}
        key={selectedParent?.id ?? "none"}
        placeholder="vendor@company.com"
      />

      <label className="label">Counterparty name</label>
      <input
        className="input"
        name="vendorName"
        defaultValue={selectedParent?.vendorName ?? ""}
        key={`name-${selectedParent?.id ?? "none"}`}
        placeholder="Acme Corp"
      />

      <label className="label">File template (optional)</label>
      <select className="input" name="fileTemplateId" defaultValue="">
        <option value="">
          {direction === "ORG_BUYING"
            ? "None — vendor will upload their contract in the portal"
            : "None — customer uploads or link contract later"}
        </option>
        {templates
          .filter((t) => t.direction === direction)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
      </select>
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        {direction === "ORG_BUYING"
          ? "Skip for tail spend: create the deal, send to vendor, they upload their paper. Pick a template when you want a starting PDF from Settings → Deal templates."
          : "Skip when the customer will provide redlines. Pick a template to seed the deal with your standard PDF."}
      </p>
      {direction === "ORG_BUYING" && (selectedType?.key === "por" || selectedType?.key === "pam") ? (
        <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
          No clause-library contract needed — the deal page will guide you through vendor upload.
        </p>
      ) : null}

      <label className="label">Compliance rule pack</label>
      <select className="input" name="rulePackId" defaultValue="">
        <option value="">Default for {direction === "ORG_BUYING" ? "procurement" : "sales"}</option>
        {packs
          .filter((p) => p.direction === direction)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </select>

      <label className="label">Message to counterparty</label>
      <textarea className="input" name="message" rows={3} placeholder="Please review and upload your redlines…" />

      <button className="btn" type="submit" disabled={busy || !commercialTypeId}>
        {busy ? "Creating…" : "Create"}
      </button>
    </form>
  );
}
