"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildHierarchy, CollapsibleHierarchyNode, type HierarchyNode } from "@/components/CollapsibleHierarchy";
import { Spinner } from "@/components/Spinner";
import { withReturnTo } from "@/lib/record-nav";

type ContractRow = {
  id: string;
  commercialId: string | null;
  parentContractId: string | null;
  typePrefix: string | null;
  direction: string | null;
  recordTypeLabel: string | null;
  title: string;
  status: string;
  template: string | null;
  updatedAt: string;
};

type CommType = { id: string; prefix: string; allowedChildIds: string[] };

type TreeRow = ContractRow & { parentId: string | null };

function ContractNode({
  node,
  depth,
  types,
  returnTo,
  listDirection,
  isAdmin,
  selected,
  onToggle,
}: {
  node: HierarchyNode<TreeRow>;
  depth: number;
  types: CommType[];
  returnTo: string;
  listDirection?: "ORG_SELLING" | "ORG_BUYING";
  isAdmin: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const dealType = types.find((t) => t.prefix === node.typePrefix);
  const hasChildTypes = (dealType?.allowedChildIds.length ?? 0) > 0;
  const checked = selected.has(node.id);

  return (
    <CollapsibleHierarchyNode
      depth={depth}
      hasChildren={node.children.length > 0}
      label={
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
          {isAdmin ? (
            <input
              type="checkbox"
              checked={checked}
              aria-label={`Select ${node.commercialId ?? node.title}`}
              onChange={() => onToggle(node.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ marginTop: 3, flexShrink: 0 }}
            />
          ) : null}
          <Link href={withReturnTo(`/contracts/${node.id}`, returnTo)} style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
            <strong>
              {node.commercialId ? (
                <span style={{ fontFamily: "ui-monospace, monospace", marginRight: 8 }}>{node.commercialId}</span>
              ) : null}
              {node.title}
            </strong>
            <div className="muted" style={{ fontSize: 12 }}>
              {node.recordTypeLabel ?? node.status} · {node.template ?? "—"}
            </div>
          </Link>
        </div>
      }
      actions={
        hasChildTypes ? (
          <Link
            className="btn secondary"
            style={{ padding: "4px 10px", fontSize: 12 }}
            href={`/contracts/new?parentId=${node.id}&direction=${node.direction ?? listDirection ?? "ORG_SELLING"}&from=${encodeURIComponent(returnTo)}`}
          >
            + Child
          </Link>
        ) : null
      }
    >
      {node.children.map((c) => (
        <ContractNode
          key={c.id}
          node={c}
          depth={depth + 1}
          types={types}
          returnTo={returnTo}
          listDirection={listDirection}
          isAdmin={isAdmin}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
    </CollapsibleHierarchyNode>
  );
}

export function ContractsList({ direction }: { direction?: "ORG_SELLING" | "ORG_BUYING" }) {
  const pathname = usePathname() ?? "/contracts/sales";
  const router = useRouter();
  const returnTo = pathname.startsWith("/contracts") ? pathname : direction === "ORG_BUYING" ? "/contracts/procurement" : "/contracts/sales";
  const [contracts, setContracts] = useState<ContractRow[] | null>(null);
  const [types, setTypes] = useState<CommType[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/contracts");
    if (r.ok) {
      const j = await r.json();
      setContracts(j.contracts);
      setTypes(j.types ?? []);
      setIsAdmin(Boolean(j.isAdmin));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected(new Set());
  }, [direction]);

  const filtered = useMemo(
    () => (contracts ? (direction ? contracts.filter((c) => c.direction === direction) : contracts) : []),
    [contracts, direction],
  );

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = filteredIds.some((id) => selected.has(id));

  const tree = useMemo(
    () => buildHierarchy(filtered.map((c) => ({ ...c, parentId: c.parentContractId }))),
    [filtered],
  );

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredIds));
    }
  }

  async function deleteSelected() {
    const ids = [...selected].filter((id) => filteredIds.includes(id));
    if (ids.length === 0 || busy) return;
    const label = ids.length === 1 ? "this contract" : `${ids.length} contracts`;
    if (
      !window.confirm(
        `Delete ${label}? Linked deals will be unlinked (not deleted). Child contracts must be removed first. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/contracts/bulk-delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const j = (await r.json()) as { error?: string; deleted?: number; failed?: { id: string; error: string }[] };
      if (!r.ok) {
        setMsg(j.error ?? `Error ${r.status}`);
        return;
      }
      const failed = j.failed ?? [];
      if (failed.length) {
        setMsg(`Deleted ${j.deleted ?? 0}. Failed: ${failed.map((f) => f.error).join("; ")}`);
        setSelected(new Set(failed.map((f) => f.id)));
      } else {
        setMsg(`Deleted ${j.deleted ?? ids.length} contract(s).`);
        setSelected(new Set());
      }
      await load();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!contracts) return <p className="muted">Loading…</p>;

  if (tree.length === 0) {
    const newHref =
      direction === "ORG_BUYING"
        ? "/contracts/new?direction=ORG_BUYING&from=/contracts/procurement"
        : "/contracts/new?direction=ORG_SELLING&from=/contracts/sales";
    const newLabel = direction === "ORG_BUYING" ? "New procurement contract" : "New sales contract";
    return (
      <div className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          No {direction === "ORG_BUYING" ? "procurement" : "sales"} contracts yet.
        </p>
        <Link className="btn" href={newHref}>
          {newLabel}
        </Link>
      </div>
    );
  }

  return (
    <div>
      {isAdmin ? (
        <div className="card contracts-bulk-bar" style={{ marginBottom: 12, padding: "10px 14px" }}>
          <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={toggleAll}
              />
              Select all ({filtered.length})
            </label>
            <button
              type="button"
              className="btn secondary"
              disabled={selected.size === 0 || busy}
              onClick={() => void deleteSelected()}
            >
              {busy ? (
                <>
                  <Spinner size={14} style={{ marginRight: 6, verticalAlign: "middle" }} /> Deleting…
                </>
              ) : (
                `Delete selected (${selected.size})`
              )}
            </button>
            <span className="muted" style={{ fontSize: 12 }}>
              Admin only · deals are unlinked, not deleted
            </span>
          </div>
          {msg ? <p style={{ fontSize: 12, margin: "8px 0 0", color: msg.includes("Failed") ? "var(--red)" : "var(--green)" }}>{msg}</p> : null}
        </div>
      ) : null}

      {tree.map((n) => (
        <ContractNode
          key={n.id}
          node={n}
          depth={0}
          types={types}
          returnTo={returnTo}
          listDirection={direction}
          isAdmin={isAdmin}
          selected={selected}
          onToggle={toggleOne}
        />
      ))}
    </div>
  );
}
