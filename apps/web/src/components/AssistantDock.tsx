"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AssistantChat, type AssistantContext } from "@/components/AssistantChat";

// Sub-routes under /deals that are pages, not a deal id.
const DEAL_NON_IDS = new Set(["new", "sales", "procurement", "tail-spend"]);

/** Derive what the assistant should act on from the page the user is viewing. */
function deriveContext(path: string): { context?: AssistantContext; label: string } {
  const deal = path.match(/^\/deals\/([^/]+)/);
  if (deal && !DEAL_NON_IDS.has(deal[1])) return { context: { dealId: deal[1] }, label: "Scoped to this deal" };
  const doc = path.match(/^\/documents\/([^/]+)/);
  if (doc) return { context: { documentId: doc[1] }, label: "Scoped to this document" };
  return { label: "Across your whole portfolio" };
}

/**
 * A global, page-aware assistant. Floats on every app page; when opened on a
 * deal or document, bare commands ("run compliance", "what's blocking this?")
 * act on that record. The dedicated /assistant page has its own full-screen
 * copy, so the dock hides there.
 */
export function AssistantDock() {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const { context, label } = deriveContext(path);

  // Close on route change so a stale scope never lingers.
  useEffect(() => setOpen(false), [path]);
  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (path === "/assistant" || path.startsWith("/assistant/")) return null;

  return (
    <>
      {!open ? (
        <button type="button" className="assistant-fab" onClick={() => setOpen(true)} aria-label="Open assistant">
          <span className="assistant-fab-icon">✨</span>
          Ask ContractIQ
        </button>
      ) : null}
      {open ? (
        <>
          <div className="chat-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="chat-drawer assistant-dock" role="dialog" aria-label="ContractIQ assistant">
            <div className="chat-head">
              <div style={{ minWidth: 0 }}>
                <div className="chat-title">Assistant</div>
                <div className="chat-scope">{label}</div>
              </div>
              <button type="button" className="btn secondary" style={{ padding: "4px 10px" }} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            {/* key resets chat state when the scope changes between pages */}
            <AssistantChat key={path} context={context} />
          </div>
        </>
      ) : null}
    </>
  );
}
