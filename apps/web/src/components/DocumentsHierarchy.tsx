"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RemoveButton } from "@/components/RemoveButton";
import { buildHierarchy, CollapsibleHierarchyNode, type HierarchyNode } from "@/components/CollapsibleHierarchy";
import { Spinner } from "@/components/Spinner";
import { ChatPanel } from "@/components/ChatPanel";

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
  collections,
  onAsk,
}: {
  node: HierarchyNode<TreeRow>;
  depth: number;
  onRefresh: () => void;
  isAdmin: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  collections: { id: string; title: string }[];
  onAsk: (id: string, title: string) => void;
}) {
  const isCollection = node.kind === "COLLECTION";
  const checked = selected.has(node.id);

  async function move(target: string) {
    const collectionParentId = target === "__top__" ? null : target;
    if (collectionParentId === node.collectionParentId) return;
    const r = await fetch(`/api/documents/${node.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ collectionParentId }),
    });
    if (r.ok) onRefresh();
    else alert(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Move failed");
  }

  return (
    <CollapsibleHierarchyNode
      depth={depth}
      hasChildren={node.children.length > 0}
      label={
        <div className="doc-row-main">
          {isAdmin ? (
            <input
              type="checkbox"
              checked={checked}
              aria-label={`Select ${node.title}`}
              onChange={() => onToggle(node.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ flexShrink: 0 }}
            />
          ) : null}
          <span className={`doc-icon ${isCollection ? "folder" : "file"}`} aria-hidden="true">
            {isCollection ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
            )}
          </span>
          {isCollection ? (
            <div style={{ minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>
                {node.commercialId ? (
                  <span style={{ fontFamily: "ui-monospace, monospace", marginRight: 8, color: "var(--muted)", fontSize: 12 }}>{node.commercialId}</span>
                ) : null}
                {node.title}
              </strong>
              <div className="muted" style={{ fontSize: 11 }}>
                Collection · {node.children.length} item{node.children.length === 1 ? "" : "s"}
              </div>
            </div>
          ) : (
            <Link href={`/documents/${node.id}`} style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}>
              <strong style={{ fontSize: 14 }}>
                {node.commercialId ? (
                  <span style={{ fontFamily: "ui-monospace, monospace", marginRight: 8, color: "var(--muted)", fontSize: 12 }}>{node.commercialId}</span>
                ) : null}
                {node.title}
              </strong>
              <div className="muted" style={{ fontSize: 11 }}>
                PDF · {node.pageCount} pages · v{node.version}
              </div>
            </Link>
          )}
        </div>
      }
      actions={
        <>
          {isCollection ? (
            <>
              <button
                type="button"
                className="btn always"
                style={{ padding: "3px 10px", fontSize: 12 }}
                onClick={() => onAsk(node.id, node.title)}
                title="Chat with every document in this collection"
              >
                💬 Ask AI
              </button>
              <Link className="btn secondary always" style={{ padding: "3px 10px", fontSize: 12 }} href={`/documents?uploadTo=${node.id}`}>
                + PDF
              </Link>
            </>
          ) : null}
          {collections.length > 0 ? (
            <select
              className="input"
              aria-label={`Move ${node.title} to a collection`}
              title="Move to collection"
              value={node.collectionParentId ?? "__top__"}
              onChange={(e) => void move(e.target.value)}
              style={{ width: "auto", padding: "3px 8px", fontSize: 12 }}
            >
              <option value="__top__">Top level</option>
              {collections
                .filter((c) => c.id !== node.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    → {c.title}
                  </option>
                ))}
            </select>
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
          collections={collections}
          onAsk={onAsk}
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
  const [chat, setChat] = useState<{ id: string; title: string } | null>(null);
  const [search, setSearch] = useState("");

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

  // Reliable client refresh after create/upload/move (dispatched by those actions).
  useEffect(() => {
    const onRefresh = () => refresh();
    window.addEventListener("documents-refresh", onRefresh);
    return () => window.removeEventListener("documents-refresh", onRefresh);
  }, [refresh]);

  const docsById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const allIds = useMemo(() => docs.map((d) => d.id), [docs]);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const someSelected = allIds.some((id) => selected.has(id));

  const tree = useMemo(() => buildHierarchy(docs.map((d) => ({ ...d, parentId: d.collectionParentId }))), [docs]);
  const collections = useMemo(
    () => docs.filter((d) => d.kind === "COLLECTION").map((d) => ({ id: d.id, title: d.title })),
    [docs],
  );

  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.commercialId?.toLowerCase().includes(q) ?? false) ||
        (d.ownerEmail?.toLowerCase().includes(q) ?? false),
    );
  }, [docs, search]);

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

  if (docs.length === 0) {
    return (
      <div className="card">
        <p className="muted">No documents yet. Upload PDFs or create a collection folder.</p>
      </div>
    );
  }

  const flatNodes = (searchMatches ?? []).map((d) => ({ ...d, parentId: d.collectionParentId, children: [] as never[] }));

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        <input
          className="input"
          style={{ maxWidth: 340, flex: "1 1 240px" }}
          placeholder="Search documents & collections by name, ID, or owner…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {searchMatches ? (
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>
            {searchMatches.length} match{searchMatches.length === 1 ? "" : "es"}
            <button
              type="button"
              onClick={() => setSearch("")}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", marginLeft: 8, fontSize: 12 }}
            >
              clear
            </button>
          </span>
        ) : null}
      </div>

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

      {searchMatches ? (
        flatNodes.length === 0 ? (
          <div className="card">
            <p className="muted" style={{ margin: 0 }}>No documents match “{search.trim()}”.</p>
          </div>
        ) : (
          flatNodes.map((n) => (
            <DocNode
              key={n.id}
              node={n}
              depth={0}
              onRefresh={refresh}
              isAdmin={isAdmin}
              selected={selected}
              onToggle={toggleOne}
              collections={collections}
              onAsk={(cid, ctitle) => setChat({ id: cid, title: ctitle })}
            />
          ))
        )
      ) : (
        tree.map((n) => (
          <DocNode
            key={n.id}
            node={n}
            depth={0}
            onRefresh={refresh}
            isAdmin={isAdmin}
            selected={selected}
            onToggle={toggleOne}
            collections={collections}
            onAsk={(cid, ctitle) => setChat({ id: cid, title: ctitle })}
          />
        ))
      )}

      {chat ? (
        <ChatPanel documentId={chat.id} title={chat.title} scope="collection" open onClose={() => setChat(null)} />
      ) : null}
    </div>
  );
}
