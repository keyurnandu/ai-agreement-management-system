const STORAGE_PREFIX = "doc-attr-visible:";

export function loadVisibleAttributeKeys(documentId: string, allKeys: string[]): Set<string> {
  if (typeof window === "undefined") return new Set(allKeys);
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + documentId);
    if (!raw) return new Set(allKeys);
    const hidden = JSON.parse(raw) as string[];
    if (!Array.isArray(hidden)) return new Set(allKeys);
    const hiddenSet = new Set(hidden);
    const visible = allKeys.filter((k) => !hiddenSet.has(k));
    return visible.length ? new Set(visible) : new Set(allKeys);
  } catch {
    return new Set(allKeys);
  }
}

export function saveHiddenAttributeKeys(documentId: string, allKeys: string[], visibleKeys: Set<string>) {
  if (typeof window === "undefined") return;
  const hidden = allKeys.filter((k) => !visibleKeys.has(k));
  if (hidden.length === 0) localStorage.removeItem(STORAGE_PREFIX + documentId);
  else localStorage.setItem(STORAGE_PREFIX + documentId, JSON.stringify(hidden));
}
