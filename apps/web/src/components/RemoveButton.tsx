"use client";

import { useState } from "react";

type Props = {
  label?: string;
  confirmMessage: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
  onDone?: () => void;
  className?: string;
};

export function RemoveButton({ label = "Remove", confirmMessage, onDelete, onDone, className }: Props) {
  const [busy, setBusy] = useState(false);

  async function click() {
    if (!window.confirm(confirmMessage)) return;
    setBusy(true);
    const result = await onDelete();
    setBusy(false);
    if (result.ok) {
      onDone?.();
    } else {
      window.alert(result.error ?? "Remove failed.");
    }
  }

  return (
    <button
      type="button"
      className={className ?? "btn secondary"}
      style={{ padding: "2px 8px", fontSize: 11, color: "var(--red)" }}
      disabled={busy}
      onClick={() => void click()}
    >
      {busy ? "Removing…" : label}
    </button>
  );
}

async function deleteApi(url: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(url, { method: "DELETE" });
  if (r.ok) return { ok: true };
  try {
    const j = (await r.json()) as { error?: string };
    return { ok: false, error: j.error ?? `Error ${r.status}` };
  } catch {
    return { ok: false, error: `Error ${r.status}` };
  }
}

export function removeResource(url: string, onDone?: () => void) {
  return (
    <RemoveButton
      confirmMessage="Remove this item? This cannot be undone."
      onDelete={() => deleteApi(url)}
      onDone={onDone}
    />
  );
}
