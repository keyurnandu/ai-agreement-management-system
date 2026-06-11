"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RemoveButton } from "@/components/RemoveButton";
import { buildHierarchy, CollapsibleHierarchyNode, type HierarchyNode } from "@/components/CollapsibleHierarchy";
import { Spinner } from "@/components/Spinner";

type DocRow = {
  id: string;
  commercialId: string | null;
  kind: string;
  collectionParentId: string | null;
  typePrefix: string | null;
  title: string;
  ownerEmail: string;
  pageCount: number | string;
  version: number;
  updatedAt: string;
};

type TreeRow = DocRow & { parentId: string | null };

function deleteDepth(docsById: Map<string, DocRow>, id: string): number {
  let depth = 0;
  let cur = docsById.get(id);
  while (cur?.collectionParentId) {
    const parent = docsById.get(cur.collectionParentId);
    if (!parent) break;
    depth++;
    cur = parent;
  }
  return depth;
}

function sortForDelete(ids: string[], docsById: Map<string, DocRow>): string[] {
  return [...ids].sort((a, b) => deleteDepth(docsById, b) - deleteDepth(docsById, a));
}

function DocNode({
  node,
  depth,
  onRefresh,
  isAdmin,
  selected,
  onToggle,
}: {
  node: HierarchyNode<TreeRow>;
  depth: number;
  onRefresh: () => void;
  isAdmin: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isCollection = node.kind === "COLLECTION";
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
              aria-label={`Select ${node.title}`}
              onChange={() => onToggle(node.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ marginTop: 3, flexShrink: 0 }}
            />
          ) : null}
          {isCollection ? (
            <div>
              <strong>
                {node.commercialId ? (
                  <span style={{ fontFamily: "ui-monospace, monospace", marginRight: 8 }}>{node.commercialId}</span>
                ) : null}
                {node.title}
              </strong>
              <div className="muted" style={{ fontSize: 12 }}>
                Collection · {node.ownerEmail}
              </div>
            </div>
          ) : (
            <Link href={`/documents/${node.id}`} style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
              <strong>
                {node.commercialId ? (
                  <span style={{ fontFamily: "ui-monospace, monospace", marginRight: 8 }}>{node.commercialId}</span>
                ) : null}
                {node.title}
              </strong>
              <div className="muted" style={{ fontSize: 12 }}>
                PDF · {node.pageCount} pages · v{node.version}
              </div>
            </Link>
          )}
        </div>
      }
      actions={
        <>
          {isCollection ? (
            <Link
              className="btn secondary"
              style={{ padding: "4px 10px", fontSize: 12 }}
              href={`/documents?uploadTo=${node.id}`}
            >
              + PDF
            </Link>
          ) : null}
          <RemoveButton
            label="Delete"
            confirmMessage={`Delete "${node.title}"? Linked deals or agreements must be removed first.`}
            onDelete={async () => {
              const r = await fetch(`/api/documents/${node.id}`, { method: "DELETE" });
              if (r.ok) return { ok: true };
              const j = (await r.json().catch(() => ({}))) as { error?: string };
              return { ok: false, error: j.error ?? `Error ${r.status}` };
            }}
            onDone={onRefresh}
          />
        </>
      }
    >
      {node.children.map((c) => (
        <DocNode
          key={c.id}
          node={c}
          depth={depth + 1}
          onRefresh={onRefresh}
          isAdmin={isAdmin}
          selected={selected}
          onToggle={onToggle}
        />
      ))}
    </CollapsibleHierarchyNode>
  );
}

export function DocumentsHierarchy({
  initialDocs,
  isAdmin: isAdminProp,
}: {
  initialDocs: DocRow[];
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [docs, setDocs] = useState(initialDocs);
  const [isAdmin, setIsAdmin] = useState(Boolean(isAdminProp));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void fetch("/api/documents/list")
      .then((r) => r.json())
      .then((j) => {
        const data = j as { documents: DocRow[]; isAdmin?: boolean };
        setDocs(data.documents ?? []);
        if (typeof data.isAdmin === "boolean") setIsAdmin(data.isAdmin);
      })
      .then(() => router.refresh());
  }, [router]);

  useEffect(() => {
    setDocs(initialDocs);
  }, [initialDocs]);

  useEffect(() => {
    if (typeof isAdminProp === "boolean") setIsAdmin(isAdminProp);
  }, [isAdminProp]);

  const docsById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const allIds = useMemo(() => docs.map((d) => d.id), [docs]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = allIds.some((id) => selected.has(id));

  const tree = useMemo(() => buildHierarchy(docs.map((d) => ({ ...d, parentId: d.collectionParentId }))), [docs]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  async function deleteSelected() {
    const ids = sortForDelete([...selected], docsById);
    if (ids.length === 0 || busy) return;
    const label = ids.length === 1 ? "this document" : `${ids.length} documents`;
    if (
      !window.confirm(
        `Delete ${label}? Items linked to deals, agreements, or templates will fail. Collections must be empty or deleted after their PDFs. This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/documents/bulk-delete", {
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
        setMsg(`Deleted ${j.deleted ?? ids.length} document(s).`);
        setSelected(new Set());
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  if (tree.length === 0) {
    return (
      <div className="card">
        <p className="muted">No documents yet. Upload PDFs or create a collection folder.</p>
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
              Select all ({allIds.length})
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
              Admin only · empty collections first, or select all to remove a folder and its PDFs
            </span>
          </div>
          {msg ? (
            <p style={{ fontSize: 12, margin: "8px 0 0", color: msg.includes("Failed") ? "var(--red)" : "var(--green)" }}>
              {msg}
            </p>
          ) : null}
        </div>
      ) : null}

      {tree.map((n) => (
        <DocNode
          key={n.id}
          node={n}
          depth={0}
          onRefresh={refresh}
          isAdmin={isAdmin}
          selected={selected}
          onToggle={toggleOne}
        />
      ))}
    </div>
  );
}
