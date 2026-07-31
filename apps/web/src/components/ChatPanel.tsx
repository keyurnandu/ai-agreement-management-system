"use client";

import { useEffect, useRef, useState } from "react";
import { useAttributeHighlight } from "@/components/AttributeHighlightContext";

type Citation = { n: number; score: number; text: string };
type Msg = {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  provider?: string;
};

const SUGGESTIONS = [
  "Summarize this contract in plain English",
  "What is our liability exposure?",
  "When does this expire and how do we renew?",
  "What are our payment obligations?",
];

export function ChatPanel({
  documentId,
  title,
  open,
  onClose,
}: {
  documentId: string;
  title: string;
  open: boolean;
  onClose: () => void;
}) {
  const { setHighlight } = useAttributeHighlight();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await fetch(`/api/documents/${documentId}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
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

  // Jump a citation to its spot on the rendered PDF (same locate as attributes).
  async function jumpTo(text: string) {
    const query = text.replace(/\s+/g, " ").trim().slice(0, 120);
    try {
      const r = await fetch(`/api/documents/${documentId}/locate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      if (!r.ok) return;
      const j = (await r.json()) as { page?: number; rect?: { x: number; y: number; w: number; h: number } | null };
      if (j.rect) setHighlight({ key: `chat:${query}`, page: j.page ?? 1, snippet: query, start: 0, end: 0, rect: j.rect });
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
            <button type="button" className="btn secondary" style={{ padding: "4px 10px" }} onClick={onClose}>
              Close
            </button>
          </div>

          <div className="chat-body" ref={listRef}>
            {messages.length === 0 ? (
              <div className="chat-empty">
                <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                  Ask anything about this document. Answers cite the source — click a citation to jump to it on the PDF.
                </p>
                <div className="chat-suggest">
                  {SUGGESTIONS.map((s) => (
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
                        <button key={c.n} type="button" className="chat-cite" title={c.text} onClick={() => void jumpTo(c.text)}>
                          ¶{c.n} ↗
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
