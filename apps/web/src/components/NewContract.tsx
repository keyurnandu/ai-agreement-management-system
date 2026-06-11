"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { defaultVariablesForType, templatesForCommercialType } from "@/lib/template-defaults";

type Var = { key: string; label: string; type: string; required: boolean };
type Tpl = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  variables: Var[] | null;
  clauses: number;
};
type CommType = {
  id: string;
  key: string;
  prefix: string;
  name: string;
  direction: string;
  isRoot: boolean;
  allowedParentIds: string[];
};
type UnlinkedDeal = {
  id: string;
  title: string;
  commercialId: string | null;
  typePrefix: string | null;
  commercialTypeKey: string | null;
};
type ContractCandidate = {
  id: string;
  commercialId: string | null;
  title: string;
  direction: string | null;
  commercialTypeId: string | null;
  typePrefix: string | null;
};

const DEAL_TO_CONTRACT: Record<string, string> = {
  smcw: "csmcw",
  scw: "cscw",
  sor: "csor",
  sam: "csam",
  pmcw: "cpmcw",
  pcw: "cpcw",
  por: "cpor",
  pam: "cpam",
};

function typeHint(t: CommType): string {
  if (t.isRoot) return "Framework / master agreement";
  if (t.key.endsWith("or")) return "Order form — standalone or under a wrapper";
  if (t.key.endsWith("am")) return "Amendment — link to master or wrapper when needed";
  if (t.key.endsWith("cw")) return "Wrapper — optional link under master";
  return "Create from clause template";
}

function sortTypes(types: CommType[]): CommType[] {
  const rank = (t: CommType) => {
    if (t.isRoot) return 0;
    if (t.key.endsWith("cw")) return 1;
    if (t.key.endsWith("or")) return 2;
    return 3;
  };
  return [...types].sort((a, b) => rank(a) - rank(b) || a.prefix.localeCompare(b.prefix));
}

const MULTILINE_VAR_KEYS = new Set(["services_description", "amended_provisions", "special_terms"]);

const SERVICES_TABLE_PLACEHOLDER = `| SKU | Product | Qty | Unit Price |
| --- | --- | --- | --- |
| SKU-001 | Product name | 1 | $0.00 |`;

function VariableField({
  v,
  value,
  onChange,
}: {
  v: Var;
  value: string;
  onChange: (next: string) => void;
}) {
  if (v.key === "services_description") {
    return (
      <>
        <textarea
          className="input clause-body"
          rows={6}
          value={value}
          placeholder={SERVICES_TABLE_PLACEHOLDER}
          onChange={(e) => onChange(e.target.value)}
        />
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
          Use a markdown pipe table (header row, <code>| --- |</code> separator, then data rows). Renders as a table in the PDF.
        </p>
      </>
    );
  }
  if (MULTILINE_VAR_KEYS.has(v.key)) {
    return (
      <textarea
        className="input clause-body"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      className="input"
      type={v.type === "date" ? "date" : v.type === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function NewContract({
  parentId,
  dealId,
  direction,
}: {
  parentId?: string;
  dealId?: string;
  direction?: "ORG_SELLING" | "ORG_BUYING";
}) {
  const router = useRouter();
  const [tpls, setTpls] = useState<Tpl[] | null>(null);
  const [types, setTypes] = useState<CommType[]>([]);
  const [contracts, setContracts] = useState<ContractCandidate[]>([]);
  const [parentTypeId, setParentTypeId] = useState<string | null>(null);
  const [parentLabel, setParentLabel] = useState<string | null>(null);
  const [linkParentContractId, setLinkParentContractId] = useState(parentId ?? "");
  const [dealTypeKey, setDealTypeKey] = useState<string | null>(null);
  const [unlinkedDeals, setUnlinkedDeals] = useState<UnlinkedDeal[]>([]);
  const [linkDealId, setLinkDealId] = useState(dealId ?? "");
  const [orgName, setOrgName] = useState("");
  const [sel, setSel] = useState<Tpl | null>(null);
  const [commercialTypeId, setCommercialTypeId] = useState("");
  const [title, setTitle] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [metaReady, setMetaReady] = useState(false);
  const typeLocked = !!dealTypeKey;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [tplRes, typeRes, orgRes, contractRes] = await Promise.all([
        fetch("/api/templates"),
        fetch("/api/commercial-types?domain=CONTRACT"),
        fetch("/api/org/settings"),
        fetch("/api/contracts"),
      ]);
      if (cancelled) return;
      if (tplRes.ok) setTpls(((await tplRes.json()) as { templates: Tpl[] }).templates);
      if (typeRes.ok) setTypes(((await typeRes.json()) as { types: CommType[] }).types ?? []);
      if (orgRes.ok) {
        setOrgName(((await orgRes.json()) as { org?: { orgName?: string } }).org?.orgName ?? "");
      }
      if (contractRes.ok) {
        setContracts(((await contractRes.json()) as { contracts: ContractCandidate[] }).contracts ?? []);
      }

      if (parentId) {
        const pRes = await fetch(`/api/contracts/${parentId}`);
        if (!cancelled && pRes.ok) {
          const p = (await pRes.json()) as {
            commercialTypeId?: string | null;
            commercialType?: { prefix?: string; name?: string; commercialId?: string };
            title?: string;
            commercialId?: string | null;
          };
          if (p.commercialTypeId) setParentTypeId(p.commercialTypeId);
          const label = p.commercialId
            ? `${p.commercialId} — ${p.title ?? ""}`
            : p.commercialType
              ? `${p.commercialType.prefix} — ${p.commercialType.name}`
              : p.title ?? null;
          setParentLabel(label);
        }
      }

      if (dealId) {
        const dRes = await fetch(`/api/deals/${dealId}/context`);
        if (!cancelled && dRes.ok) {
          const d = (await dRes.json()) as {
            commercialId?: string;
            vendorName?: string;
            contractTypeKey?: string;
            hasLinkedContract?: boolean;
          };
          if (d.hasLinkedContract) {
            setErr("This deal already has a linked contract. Open the deal page and use the Contract tab.");
          }
          if (d.contractTypeKey) setDealTypeKey(d.contractTypeKey);
          setVals((prev) => ({ ...prev, customer: d.vendorName ?? prev.customer ?? "" }));
        }
      } else {
        const uRes = await fetch("/api/deals/unlinked");
        if (!cancelled && uRes.ok) {
          setUnlinkedDeals(((await uRes.json()) as { deals: UnlinkedDeal[] }).deals ?? []);
        }
      }

      if (!cancelled) setMetaReady(true);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [parentId, dealId]);

  const allowedTypes = useMemo(() => {
    if (!types.length) return [];
    if (dealTypeKey) return types.filter((t) => t.key === dealTypeKey);
    if (parentTypeId) return types.filter((t) => t.allowedParentIds.includes(parentTypeId));
    const forDirection = direction ? types.filter((t) => t.direction === direction) : types;
    return sortTypes(forDirection.filter((t) => t.isRoot || t.allowedParentIds.length > 0));
  }, [types, dealTypeKey, parentTypeId, direction]);

  useEffect(() => {
    if (!metaReady || !parentId || !parentTypeId || dealTypeKey || commercialTypeId) return;
    if (allowedTypes.length === 1) setCommercialTypeId(allowedTypes[0].id);
  }, [metaReady, parentId, parentTypeId, dealTypeKey, allowedTypes, commercialTypeId]);

  useEffect(() => {
    if (!dealTypeKey || commercialTypeId) return;
    const match = types.find((t) => t.key === dealTypeKey);
    if (match) setCommercialTypeId(match.id);
  }, [dealTypeKey, types, commercialTypeId]);

  const selectedType = types.find((t) => t.id === commercialTypeId);

  const matchingTemplates = useMemo(() => {
    if (!tpls || !selectedType) return [];
    return templatesForCommercialType(selectedType.key, tpls);
  }, [tpls, selectedType]);

  const supportsParent = (selectedType?.allowedParentIds.length ?? 0) > 0;

  const parentOptions = useMemo(() => {
    if (!selectedType?.allowedParentIds.length) return [];
    return contracts.filter(
      (c) =>
        (!direction || c.direction === direction) &&
        c.commercialTypeId &&
        selectedType.allowedParentIds.includes(c.commercialTypeId),
    );
  }, [contracts, selectedType, direction]);

  function pick(t: Tpl, typeKey?: string) {
    setSel(t);
    setTitle(t.name);
    const tk = typeKey ?? selectedType?.key ?? "";
    const defaults = defaultVariablesForType(tk, { orgName: orgName || undefined });
    const init: Record<string, string> = { ...defaults };
    (t.variables ?? []).forEach((v) => {
      if (v.type === "date" && !init[v.key]) init[v.key] = new Date().toISOString().slice(0, 10);
    });
    setVals(init);
  }

  async function create() {
    if (!sel || !commercialTypeId) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateId: sel.id,
          title,
          variables: vals,
          commercialTypeId,
          parentContractId: linkParentContractId || parentId || undefined,
          dealId: dealId || linkDealId || undefined,
        }),
      });
      if (r.ok) {
        const j = (await r.json()) as { id: string; dealId?: string | null };
        const targetDeal = j.dealId ?? dealId ?? linkDealId;
        if (targetDeal) router.push(`/deals/${targetDeal}`);
        else router.push(`/contracts/${j.id}`);
      } else setErr(((await r.json()) as { error?: string }).error ?? "error");
    } finally {
      setBusy(false);
    }
  }

  if (!tpls || !metaReady) return <p className="muted">Loading…</p>;

  if (allowedTypes.length === 0) {
    return (
      <div className="card">
        <p className="error" style={{ margin: 0 }}>
          No contract types available for this context.
          {parentId ? " Check that the parent contract type allows children." : ""}
        </p>
      </div>
    );
  }

  if (!commercialTypeId && !typeLocked) {
    return (
      <div>
        {parentLabel ? (
          <p className="lead">
            Child of <strong>{parentLabel}</strong> — pick the record type:
          </p>
        ) : (
          <p className="lead">Pick master, wrapper, order, or amendment:</p>
        )}
        <div className="grid grid-2">
          {allowedTypes.map((t) => (
            <button
              key={t.id}
              type="button"
              className="card card-action"
              onClick={() => setCommercialTypeId(t.id)}
            >
              <strong>
                {t.prefix} — {t.name}
              </strong>
              <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                {typeHint(t)}
              </p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!sel) {
    if (matchingTemplates.length === 0) {
      return (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            No template configured for {selectedType?.prefix ?? "this type"}. Add one in Settings or pick another type.
          </p>
          {!typeLocked ? (
            <button
              type="button"
              className="btn secondary"
              style={{ marginTop: 12 }}
              onClick={() => setCommercialTypeId("")}
            >
              ← pick another type
            </button>
          ) : null}
        </div>
      );
    }

    return (
      <div>
        {!typeLocked ? (
          <button
            type="button"
            className="btn secondary"
            style={{ marginBottom: 14 }}
            onClick={() => setCommercialTypeId("")}
          >
            ← pick another type
          </button>
        ) : null}
        <p className="lead">
          {selectedType ? `${selectedType.prefix} — ${selectedType.name}` : "Choose a template"}:
        </p>
        <div className="grid grid-2">
          {matchingTemplates.map((t) => (
            <button key={t.id} type="button" className="card card-action" onClick={() => pick(t)}>
              <strong>{t.name}</strong>
              <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
                {t.description}
              </p>
              <span className="pill" style={{ marginTop: 8 }}>
                {t.clauses} clauses · {(t.variables ?? []).length} fields pre-filled
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="form-stack">
      <button
        type="button"
        className="btn secondary"
        onClick={() => setSel(null)}
        style={{ marginBottom: 14 }}
      >
        ← back
      </button>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{sel.name}</h2>
        {selectedType ? (
          <p className="muted" style={{ marginTop: 0 }}>
            {selectedType.prefix} — {selectedType.name}
            {dealId || linkDealId ? " · will link to deal and share commercial ID" : ""}
            {linkParentContractId || parentId ? " · under parent contract" : " · standalone"}
          </p>
        ) : null}

        {!typeLocked && allowedTypes.length > 0 ? (
          <>
            <label className="label">Record type</label>
            <select
              className="input"
              value={commercialTypeId}
              onChange={(e) => {
                setCommercialTypeId(e.target.value);
                setSel(null);
                setLinkParentContractId(parentId ?? "");
              }}
              required
            >
              {allowedTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.prefix} — {t.name}
                </option>
              ))}
            </select>
          </>
        ) : null}

        {supportsParent && selectedType ? (
          <>
            <label className="label">Link to parent contract (optional)</label>
            <select
              className="input"
              value={linkParentContractId}
              onChange={(e) => setLinkParentContractId(e.target.value)}
              disabled={!!parentId}
            >
              <option value="">None — standalone {selectedType.prefix}</option>
              {parentOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.commercialId ?? c.title} ({c.typePrefix})
                </option>
              ))}
            </select>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>
              {selectedType.key.endsWith("or")
                ? "Tail spend: leave blank for a one-off order. Link when this sits under an existing master or wrapper."
                : "Link when this continues an existing contract hierarchy; leave blank for standalone."}
            </p>
          </>
        ) : null}

        {!dealId && unlinkedDeals.length > 0 ? (
          <>
            <label className="label">Link to deal (optional)</label>
            <select
              className="input"
              value={linkDealId}
              onChange={(e) => {
                const id = e.target.value;
                setLinkDealId(id);
                const d = unlinkedDeals.find((x) => x.id === id);
                if (d?.commercialTypeKey) {
                  const contractKey = DEAL_TO_CONTRACT[d.commercialTypeKey];
                  const match = types.find((t) => t.key === contractKey);
                  if (match) {
                    setCommercialTypeId(match.id);
                    setSel(null);
                  }
                }
              }}
            >
              <option value="">No deal — new commercial ID</option>
              {unlinkedDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.commercialId ?? d.typePrefix} — {d.title}
                </option>
              ))}
            </select>
          </>
        ) : null}

        <label className="label">Contract title</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        {(sel.variables ?? []).map((v) => (
          <div key={v.key}>
            <label className="label">
              {v.label}
              {v.required ? " *" : ""}
            </label>
            <VariableField
              v={v}
              value={vals[v.key] ?? ""}
              onChange={(next) => setVals((s) => ({ ...s, [v.key]: next }))}
            />
          </div>
        ))}
        {err ? <p className="error">{err}</p> : null}
        <button type="button" className="btn" disabled={busy} onClick={create} style={{ marginTop: 16, width: "100%" }}>
          {busy ? "Creating…" : "Create with pre-filled clauses"}
        </button>
      </div>
    </div>
  );
}
