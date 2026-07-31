"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AttributeHighlightProvider } from "@/components/AttributeHighlightContext";
import { AttributesPanel } from "@/components/AttributesPanel";
import { ChatPanel } from "@/components/ChatPanel";
import type { ContextTab } from "@/lib/record-context";

const TAB_LABEL: Record<ContextTab["kind"], string> = {
  document: "Document",
  contract: "Contract",
  deal: "Deal",
};

type Props = {
  active: ContextTab["kind"];
  tabs: ContextTab[];
  title: string;
  subtitle?: ReactNode;
  backHref: string;
  backLabel: string;
  actions?: ReactNode;
  toolbar?: ReactNode;
  documentId: string | null;
  documentTitle: string | null;
  canEditAttributes: boolean;
  /** Hide attributes sidebar (e.g. deal workflow — use Agreements → extraction instead). */
  showAttributes?: boolean;
  main: ReactNode;
  below?: ReactNode;
};

export function RecordWorkspace({
  active,
  tabs,
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
  toolbar,
  documentId,
  documentTitle,
  canEditAttributes,
  showAttributes = true,
  main,
  below,
}: Props) {
  const [askOpen, setAskOpen] = useState(false);

  return (
    <AttributeHighlightProvider>
      <div className="record-workspace">
        <Link href={backHref} className="muted" style={{ fontSize: 13 }}>
          ← {backLabel}
        </Link>

        <nav className="record-context-tabs" aria-label="Record context">
          {(["document", "contract", "deal"] as const).map((kind) => {
            const tab = tabs.find((t) => t.kind === kind);
            const isActive = active === kind;
            if (!tab) {
              return (
                <span key={kind} className="record-context-tab disabled" aria-disabled="true">
                  {TAB_LABEL[kind]}
                </span>
              );
            }
            return (
              <Link
                key={kind}
                href={tab.href}
                className={`record-context-tab${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                {TAB_LABEL[kind]}
                {tab.badge ? <span className="record-tab-badge">{tab.badge}</span> : null}
              </Link>
            );
          })}
        </nav>

        <header className="record-header">
          <div className="record-header-main">
            <h1 style={{ marginTop: 0, marginBottom: 4 }}>{title}</h1>
            {subtitle ? (
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <div className="record-header-actions">
            {documentId ? (
              <button
                type="button"
                className={askOpen ? "btn" : "btn secondary"}
                onClick={() => setAskOpen((v) => !v)}
                aria-pressed={askOpen}
              >
                {askOpen ? "Ask AI on" : "Ask AI"}
              </button>
            ) : null}
            {actions}
          </div>
        </header>

        {toolbar ? <div className="record-toolbar">{toolbar}</div> : null}

        <div className={`record-body${showAttributes ? "" : " record-body-full"}`}>
          <div className="record-main">
            {main}
            {below}
          </div>

          {documentId ? (
            <ChatPanel
              documentId={documentId}
              title={documentTitle ?? title}
              open={askOpen}
              onClose={() => setAskOpen(false)}
            />
          ) : null}

          {showAttributes ? (
          <aside className="record-attributes">
            {documentId && documentTitle ? (
              <AttributesPanel documentId={documentId} documentTitle={documentTitle} canEdit={canEditAttributes} />
            ) : (
              <div className="card doc-panel">
                <h2 style={{ margin: 0 }}>Attributes</h2>
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                  Link or generate a document to extract attributes here.
                </p>
              </div>
            )}
          </aside>
          ) : null}
        </div>
      </div>
    </AttributeHighlightProvider>
  );
}
