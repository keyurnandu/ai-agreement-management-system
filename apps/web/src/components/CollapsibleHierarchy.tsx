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
    <div style={{ marginLeft: depth * 18 }}>
      <div className="hierarchy-row">
        {hasChildren ? (
          <button
            type="button"
            className="hierarchy-toggle"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "▼" : "▶"}
          </button>
        ) : (
          <span className="hierarchy-toggle-spacer" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>{label}</div>
        {actions ? <div className="hierarchy-actions">{actions}</div> : null}
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
