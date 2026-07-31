"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type LinkT = { href: string; label: string };
type Proposal = { tool: string; dealId?: string; title?: string; summary: string; args?: Record<string, string> };
type StepT = { tool: string; result: string };
type Msg = { role: "user" | "assistant"; text: string; links?: LinkT[]; proposal?: Proposal; steps?: StepT[]; id?: string };

const TOOL_LABEL: Record<string, string> = {
  find: "Searched deals",
  run_compliance: "Ran compliance",
  resolve_issues: "Resolved issues",
  create_collection: "Created collection",
  move_document: "Moved document",
  answer: "Looked it up",
};

const SUGGESTIONS = [
  "Which deals are at risk?",
  "Run compliance on POR-3",
  "Resolve the open issues on POR-4",
  "Create a collection called Vendor NDAs",
  "What's blocking POR-4?",
  "Send SMCW-1 for signature",
];

export function AssistantChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [handled, setHandled] = useState<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const aid = (globalThis.crypto?.randomUUID?.() ?? String(Math.random())) as string;
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", id: aid, text: "", steps: [] }]);
    setBusy(true);
    const patch = (fn: (msg: Msg) => Msg) => setMessages((m) => m.map((msg) => (msg.id === aid ? fn(msg) : msg)));
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: q }),
      });
      if (!r.body) {
        const j = (await r.json().catch(() => ({}))) as { reply?: string };
        patch((msg) => ({ ...msg, text: j.reply ?? "Sorry — no response." }));
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type?: string; step?: StepT; reply?: string; links?: LinkT[]; proposal?: Proposal; steps?: StepT[] };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "step" && ev.step) {
            patch((msg) => ({ ...msg, steps: [...(msg.steps ?? []), ev.step!] }));
          } else if (ev.type === "final") {
            patch((msg) => ({ ...msg, text: ev.reply ?? "(no reply)", links: ev.links, proposal: ev.proposal, steps: ev.steps ?? msg.steps }));
          }
        }
      }
    } catch {
      patch((msg) => ({ ...msg, text: "Sorry — that request failed." }));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(idx: number, p: Proposal) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/assistant/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool: p.tool, dealId: p.dealId, args: p.args }),
      });
      const j = (await r.json()) as Msg & { reply?: string };
      setHandled((h) => new Set(h).add(idx));
      setMessages((m) => [...m, { role: "assistant", text: j.reply ?? "Done.", links: j.links }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assistant-shell card">
      <div className="assistant-body" ref={listRef}>
        {messages.length === 0 ? (
          <div className="assistant-empty">
            <div className="assistant-hero">🤖</div>
            <h2 style={{ margin: "6px 0" }}>How can I help?</h2>
            <p className="muted" style={{ fontSize: 13, maxWidth: 460 }}>
              Ask me to look things up or do work — run a compliance check, resolve issues, create a collection, or
              send a deal for signature. I&apos;ll confirm before anything goes out.
            </p>
            <div className="assistant-suggest">
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
              {m.steps && m.steps.length ? (
                <div className="assistant-steps">
                  {m.steps.map((s, si) => (
                    <div className="assistant-step" key={si}>
                      <span className="assistant-step-check">✓</span>
                      <span className="assistant-step-tool">{TOOL_LABEL[s.tool] ?? s.tool}</span>
                      <span className="assistant-step-result">{s.result}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {m.text ? (
                <div className="chat-bubble">{m.text}</div>
              ) : m.role === "assistant" && busy ? (
                <div className="chat-bubble chat-typing">
                  <span /> <span /> <span />
                </div>
              ) : null}
              {m.links && m.links.length ? (
                <div className="chat-cites">
                  {m.links.map((l) => (
                    <Link key={l.href + l.label} href={l.href} className="chat-cite">
                      {l.label} →
                    </Link>
                  ))}
                </div>
              ) : null}
              {m.proposal ? (
                <div className="assistant-confirm">
                  <div style={{ fontSize: 13, fontWeight: 600 }}>⚠ Confirm action</div>
                  <div className="muted" style={{ fontSize: 13, margin: "3px 0 8px" }}>{m.proposal.summary}?</div>
                  {handled.has(i) ? (
                    <span className="muted" style={{ fontSize: 12 }}>✓ Done</span>
                  ) : (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="btn" disabled={busy} onClick={() => void confirm(i, m.proposal!)}>
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => setHandled((h) => new Set(h).add(i))}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}
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
          placeholder="Ask the assistant to look something up or do work…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className="btn" type="submit" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
