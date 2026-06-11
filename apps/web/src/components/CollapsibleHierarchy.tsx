"use client";

import { useState, type ReactNode } from "react";

type Props = {
  depth: number;
  defaultOpen?: boolean;
  hasChildren: boolean;
  label: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
};

export function CollapsibleHierarchyNode({
  depth,
  defaultOpen = true,
  hasChildren,
  label,
  actions,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div
        className="card"
        style={{ marginBottom: 8, padding: "10px 12px" }}
      >
        <div className="row" style={{ alignItems: "center", gap: 8 }}>
          {hasChildren ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 12,
                width: 20,
                padding: 0,
              }}
            >
              {open ? "▼" : "▶"}
            </button>
          ) : (
            <span style={{ width: 20, display: "inline-block" }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>{label}</div>
          {actions}
        </div>
      </div>
      {hasChildren && open ? children : null}
    </div>
  );
}

export type HierarchyNode<T extends { id: string; parentId: string | null }> = T & {
  children: HierarchyNode<T>[];
};

export function buildHierarchy<T extends { id: string; parentId: string | null }>(rows: T[]): HierarchyNode<T>[] {
  const map = new Map<string, HierarchyNode<T>>();
  for (const r of rows) {
    map.set(r.id, { ...r, children: [] });
  }
  const roots: HierarchyNode<T>[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  const sortRec = (nodes: HierarchyNode<T>[]) => {
    nodes.sort((a, b) => {
      const ak = ("commercialId" in a && a.commercialId) || a.id;
      const bk = ("commercialId" in b && b.commercialId) || b.id;
      return String(ak).localeCompare(String(bk));
    });
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
