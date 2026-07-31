"use client";

import { useEffect, useRef, useState } from "react";
import { useOptionalAttributeHighlight } from "@/components/AttributeHighlightContext";

type Citation = { n: number; score: number; text: string; docId?: string; docTitle?: string; page?: number; href?: string };
type Msg = {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  provider?: string;
};

const DOC_SUGGESTIONS = [
  "Summarize this contract in plain English",
  "What is our liability exposure?",
  "When does this expire and how do we renew?",
  "What are our payment obligations?",
];
const COLLECTION_SUGGESTIONS = [
  "Which contract has the highest liability exposure?",
  "Summarize the agreements in this collection",
  "Which of these auto-renews?",
  "What governing law do these use?",
];
const DEAL_SUGGESTIONS = [
  "What's blocking this deal?",
  "What's the status and next step?",
  "What compliance issues are open?",
  "What is our liability exposure?",
];
const PORTFOLIO_SUGGESTIONS = [
  "Which deals are at risk?",
  "What's the total value in flight?",
  "What's expiring in the next 90 days?",
  "How many deals in each stage?",
];

function suggestionsFor(scope: string) {
  if (scope === "collection") return COLLECTION_SUGGESTIONS;
  if (scope === "deal") return DEAL_SUGGESTIONS;
  if (scope === "portfolio") return PORTFOLIO_SUGGESTIONS;
  return DOC_SUGGESTIONS;
}

export function ChatPanel({
  documentId,
  title,
  open,
  onClose,
  scope = "document",
  askUrl,
}: {
  documentId: string;
  title: string;
  open: boolean;
  onClose: () => void;
  scope?: "document" | "collection" | "deal" | "portfolio";
  askUrl?: string;
}) {
  const highlight = useOptionalAttributeHighlight();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function buildTranscript(): string {
    const lines = [`# ContractIQ — Ask AI`, `on ${title} · ${new Date().toLocaleString()}`, ""];
    for (const m of messages) {
      lines.push(`**${m.role === "user" ? "You" : "AI"}:** ${m.text}`);
      if (m.citations?.length) {
        lines.push(`Sources: ${m.citations.map((c) => c.docTitle ?? `¶${c.n}`).join(", ")}`);
      }
      lines.push("");
    }
    return lines.join("\n");
  }
  async function copyTranscript() {
    try {
      await navigator.clipboard.writeText(buildTranscript());
    } catch {
      /* clipboard blocked */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  function downloadTranscript() {
    const blob = new Blob([buildTranscript()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contractiq-chat-${title.replace(/[^\w.-]+/g, "_").slice(0, 40)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    // Recent turns for follow-up context (before adding the new question).
    const history = messages.slice(-6).map((m) => ({ role: m.role, content: m.text }));
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await fetch(askUrl ?? `/api/documents/${documentId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      if (!r.ok) {
        const e = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Error ${r.status}`;
        setMessages((m) => [...m, { role: "assistant", text: `Sorry — ${e}` }]);
        return;
      }
      const j = (await r.json()) as { answer: string; citations: Citation[]; provider: string };
      setMessages((m) => [...m, { role: "assistant", text: j.answer, citations: j.citations, provider: j.provider }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry — the request failed." }]);
    } finally {
      setBusy(false);
    }
  }

  // Citation click: collection citations open their source document; document
  // citations locate + highlight on the PDF in view (if the highlight context exists).
  async function jumpTo(c: Citation) {
    if (c.href) {
      window.open(c.href, "_blank", "noopener");
      return;
    }
    if (scope === "collection" && c.docId) {
      window.open(`/documents/${c.docId}`, "_blank", "noopener");
      return;
    }
    const query = c.text.replace(/\s+/g, " ").trim().slice(0, 120);
    try {
      const r = await fetch(`/api/documents/${documentId}/locate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!r.ok) return;
      const j = (await r.json()) as { page?: number; rect?: { x: number; y: number; w: number; h: number } | null };
      if (j.rect) highlight?.setHighlight({ key: `chat:${query}`, page: j.page ?? 1, snippet: query, start: 0, end: 0, rect: j.rect });
    } catch {
      /* citation may not have a literal match */
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="chat-overlay" onClick={onClose} aria-hidden="true" />
      <div className="chat-drawer" role="dialog" aria-label="AI chat">
          <div className="chat-head">
            <div style={{ minWidth: 0 }}>
              <div className="chat-title">Ask AI</div>
              <div className="chat-scope" title={title}>on {title}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {messages.length > 0 ? (
                <>
                  <button type="button" className="btn secondary" style={{ padding: "4px 10px" }} title="Copy transcript" onClick={() => void copyTranscript()}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                  <button type="button" className="btn secondary" style={{ padding: "4px 9px" }} title="Download transcript (.md)" onClick={downloadTranscript}>
                    ⬇
                  </button>
                </>
              ) : null}
              <button type="button" className="btn secondary" style={{ padding: "4px 10px" }} onClick={onClose}>
                Close
              </button>
            </div>
          </div>

          <div className="chat-body" ref={listRef}>
            {messages.length === 0 ? (
              <div className="chat-empty">
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  {scope === "collection"
                    ? "Ask across every document in this collection. Each answer cites the source document — click it to open."
                    : scope === "deal"
                      ? "Ask about this deal — status, blockers, compliance, or the contract itself. Answers cite the source."
                      : scope === "portfolio"
                        ? "Ask about your whole portfolio — value, risk, renewals, and stages. Answers cite the deals — click to open."
                        : "Ask anything about this document. Answers cite the source — click a citation to jump to it on the PDF."}
                </p>
                <div className="chat-suggest">
                  {suggestionsFor(scope).map((s) => (
                    <button key={s} type="button" className="chat-chip" onClick={() => void send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>
                  <div className="chat-bubble">{m.text}</div>
                  {m.citations && m.citations.length > 0 ? (
                    <div className="chat-cites">
                      <span className="muted" style={{ fontSize: 11 }}>Sources:</span>
                      {m.citations.map((c) => (
                        <button key={c.n} type="button" className="chat-cite" title={c.text} onClick={() => void jumpTo(c)}>
                          {c.docTitle ? `${c.docTitle} ↗` : `¶${c.n} ↗`}
                        </button>
                      ))}
                      {m.provider ? <span className="muted" style={{ fontSize: 10 }}>· {m.provider}</span> : null}
                    </div>
                  ) : null}
                </div>
              ))
            )}
            {busy ? (
              <div className="chat-msg assistant">
                <div className="chat-bubble chat-typing">
                  <span /> <span /> <span />
                </div>
              </div>
            ) : null}
          </div>

          <form
            className="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              className="input"
              placeholder="Ask about this document…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
            />
            <button className="btn" type="submit" disabled={busy || !input.trim()}>
              Send
            </button>
          </form>
      </div>
    </>
  );
}
