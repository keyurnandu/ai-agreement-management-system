"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RemoveButton } from "@/components/RemoveButton";
import { buildHierarchy, CollapsibleHierarchyNode, type HierarchyNode } from "@/components/CollapsibleHierarchy";

type DealRow = {
  id: string;
  commercialId: string | null;
  typePrefix: string | null;
  recordTypeLabel: string;
  parentDealId: string | null;
  direction: string;
  title: string;
  status: string;
  statusLabel: string;
  vendorEmail: string;
};

type CommType = { id: string; prefix: string; allowedChildIds: string[] };
type TreeRow = DealRow & { parentId: string | null };

function DealNode({
  node,
  depth,
  types,
  onDelete,
  listDirection,
  returnTo,
}: {
  node: HierarchyNode<TreeRow>;
  depth: number;
  types: CommType[];
  onDelete: () => void;
  listDirection?: "ORG_SELLING" | "ORG_BUYING";
  returnTo: string;
}) {
  const dealType = types.find((t) => t.prefix === node.typePrefix);
  const hasChildTypes = (dealType?.allowedChildIds.length ?? 0) > 0;
  const dir = node.direction ?? listDirection ?? "ORG_SELLING";

  return (
    <CollapsibleHierarchyNode
      depth={depth}
      hasChildren={node.children.length > 0}
      label={
        <Link href={`/deals/${node.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <strong>
            {node.commercialId ? (
              <span style={{ fontFamily: "ui-monospace, monospace", marginRight: 8 }}>{node.commercialId}</span>
            ) : null}
            {node.title}
          </strong>
          <div className="muted" style={{ fontSize: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span>{node.recordTypeLabel} · {node.vendorEmail}</span>
            <span className="pill" style={{ fontSize: 10 }}>{node.statusLabel}</span>
          </div>
        </Link>
      }
      actions={
        <>
          {hasChildTypes ? (
            <Link
              className="btn secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              href={`/deals/new?parentId=${node.id}&direction=${dir}&from=${encodeURIComponent(returnTo)}`}
            >
              + Child
            </Link>
          ) : null}
          <RemoveButton
            label="Delete"
            confirmMessage={`Delete ${node.commercialId ?? node.title}?`}
            onDelete={async () => {
              const r = await fetch(`/api/deals/${node.id}`, { method: "DELETE" });
              if (r.ok) return { ok: true };
              const j = (await r.json().catch(() => ({}))) as { error?: string };
              return { ok: false, error: j.error ?? `Error ${r.status}` };
            }}
            onDone={onDelete}
          />
        </>
      }
    >
      {node.children.map((c) => (
        <DealNode
          key={c.id}
          node={c}
          depth={depth + 1}
          types={types}
          onDelete={onDelete}
          listDirection={listDirection}
          returnTo={returnTo}
        />
      ))}
    </CollapsibleHierarchyNode>
  );
}

export function DealsList({ direction }: { direction?: "ORG_SELLING" | "ORG_BUYING" }) {
  const router = useRouter();
  const [deals, setDeals] = useState<DealRow[] | null>(null);
  const [types, setTypes] = useState<CommType[]>([]);
  const [search, setSearch] = useState("");

  const returnTo = direction === "ORG_BUYING" ? "/deals/procurement" : "/deals/sales";
  const newHref = `/deals/new?direction=${direction ?? "ORG_SELLING"}&from=${encodeURIComponent(returnTo)}`;
  const newLabel = direction === "ORG_BUYING" ? "New procurement deal" : "New sales deal";

  const load = useCallback(async () => {
    const r = await fetch("/api/deals");
    if (r.ok) {
      const j = await r.json();
      setDeals(j.deals);
      setTypes(j.types ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onDelete = useCallback(() => {
    void load();
    router.refresh();
  }, [load, router]);

  if (!deals) return <p className="muted">Loading…</p>;

  const filtered = direction ? deals.filter((d) => d.direction === direction) : deals;
  const tree = buildHierarchy(filtered.map((d) => ({ ...d, parentId: d.parentDealId })));

  if (filtered.length === 0) {
    return (
      <div className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          No {direction === "ORG_BUYING" ? "procurement" : "sales"} deals yet. Create one to start the live workflow
          with a {direction === "ORG_BUYING" ? "vendor" : "customer"}.
        </p>
        <Link className="btn" href={newHref}>
          {newLabel}
        </Link>
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const searchMatches = query
    ? filtered.filter(
        (d) =>
          d.title.toLowerCase().includes(query) ||
          (d.commercialId?.toLowerCase().includes(query) ?? false) ||
          d.vendorEmail.toLowerCase().includes(query) ||
          d.recordTypeLabel.toLowerCase().includes(query),
      )
    : null;
  const flatNodes = (searchMatches ?? []).map((d) => ({ ...d, parentId: d.parentDealId, children: [] as never[] }));

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <input
          className="input"
          style={{ maxWidth: 340, flex: "1 1 240px" }}
          placeholder="Search deals by name, ID, or counterparty…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchMatches ? (
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
            {searchMatches.length} match{searchMatches.length === 1 ? "" : "es"}
            <button type="button" onClick={() => setSearch("")} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", marginLeft: 8, fontSize: 12 }}>
              clear
            </button>
          </span>
        ) : null}
      </div>

      {searchMatches ? (
        flatNodes.length === 0 ? (
          <div className="card"><p className="muted" style={{ margin: 0 }}>No deals match “{search.trim()}”.</p></div>
        ) : (
          flatNodes.map((n) => (
            <DealNode key={n.id} node={n} depth={0} types={types} onDelete={onDelete} listDirection={direction} returnTo={returnTo} />
          ))
        )
      ) : (
        tree.map((n) => (
          <DealNode key={n.id} node={n} depth={0} types={types} onDelete={onDelete} listDirection={direction} returnTo={returnTo} />
        ))
      )}
    </div>
  );
}
