"use client";

import { useCallback, useEffect, useState } from "react";

type ActivityEvent = {
  id: string;
  at: string;
  action: string;
  label: string;
  detail: string | null;
  actorEmail: string | null;
  actorName: string | null;
  ip: string | null;
  userAgent: string | null;
};

function formatActor(e: ActivityEvent): string {
  if (e.actorName && e.actorEmail) return `${e.actorName} (${e.actorEmail})`;
  return e.actorEmail ?? "Unknown";
}

function shortUa(ua: string | null): string | null {
  if (!ua) return null;
  if (ua.length <= 72) return ua;
  return `${ua.slice(0, 69)}…`;
}

export function DealActivityPanel({ dealId, refreshKey = 0 }: { dealId: string; refreshKey?: number }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/deals/${dealId}/activity`);
    setBusy(false);
    if (r.ok) {
      const j = (await r.json()) as { events: ActivityEvent[] };
      setEvents(j.events);
      setLoaded(true);
    } else {
      setErr("Could not load activity log.");
    }
  }, [dealId]);

  useEffect(() => {
    if (loaded && refreshKey > 0) void load();
  }, [refreshKey, loaded, load]);

  function onToggle(next: boolean) {
    setOpen(next);
    if (next && !loaded && !busy) void load();
  }

  return (
    <details
      className="card doc-details activity-log"
      open={open}
      onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}
    >
      <summary>Activity log</summary>
      <p className="muted" style={{ fontSize: 12, margin: "8px 0 12px" }}>
        Who did what on this deal — edits, uploads, approvals, and sign-in details when captured.
      </p>
      {busy ? <p className="muted" style={{ fontSize: 13 }}>Loading…</p> : null}
      {err ? <p className="error" style={{ fontSize: 13 }}>{err}</p> : null}
      {!busy && loaded && events.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>No activity recorded yet.</p>
      ) : null}
      {events.length > 0 ? (
        <ul className="activity-log-list">
          {events.map((e) => (
            <li key={e.id} className="activity-log-item">
              <div className="activity-log-head">
                <strong style={{ fontSize: 13 }}>{e.label}</strong>
                <time className="muted" style={{ fontSize: 11 }} dateTime={e.at} title={e.at}>
                  {new Date(e.at).toLocaleString()}
                </time>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {formatActor(e)}
              </div>
              {e.detail ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {e.detail}
                </div>
              ) : null}
              {e.ip || e.userAgent ? (
                <div className="activity-log-meta muted">
                  {e.ip ? <span>IP {e.ip}</span> : null}
                  {e.userAgent ? <span title={e.userAgent}>{shortUa(e.userAgent)}</span> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
