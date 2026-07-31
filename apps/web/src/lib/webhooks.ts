import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";

export const WEBHOOK_EVENTS = ["agreement.completed", "attribute.extracted", "document.uploaded", "contract.generated"];

/** Reject loopback / private / link-local (incl. cloud metadata) hosts so a
 * registered webhook can't be used to probe or reach internal services (SSRF).
 * Host-literal check — good enough for the obvious cases; a hardened deployment
 * would also re-resolve DNS at delivery time to defeat rebinding. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0" || h === "::1") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
    if (a >= 224) return true; // multicast / reserved
  }
  if (h.startsWith("fe80") || h.startsWith("fc") || h.startsWith("fd")) return true; // IPv6 link-local / ULA
  return false;
}

export function isPublicWebhookUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return !isPrivateHost(u.hostname);
  } catch {
    return false;
  }
}

async function deliver(s: { id: string; url: string; secret: string }, event: string, body: string): Promise<void> {
  if (!isPublicWebhookUrl(s.url)) {
    await prisma.webhookSubscription.update({ where: { id: s.id }, data: { lastStatus: -1, lastDeliveryAt: new Date() } }).catch(() => {});
    return;
  }
  let status = 0;
  try {
    const sig = createHmac("sha256", s.secret).update(body).digest("hex");
    const res = await fetch(s.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-cp-event": event, "x-cp-signature": `sha256=${sig}` },
      body,
      signal: AbortSignal.timeout(5000),
    });
    status = res.status;
  } catch {
    status = 0;
  }
  // Status write is OUTSIDE the fetch try — a delivered 2xx isn't misreported
  // as failed just because the follow-up DB write hiccups.
  await prisma.webhookSubscription.update({ where: { id: s.id }, data: { lastStatus: status, lastDeliveryAt: new Date() } }).catch(() => {});
}

/**
 * Fire an event to all matching active webhook subscriptions. Deliveries run in
 * the background (signed HMAC-SHA256) so a slow/hung receiver never delays the
 * triggering request; failures are recorded, not thrown.
 */
export async function emitEvent(event: string, data: Record<string, unknown>): Promise<void> {
  let subs;
  try {
    subs = await prisma.webhookSubscription.findMany({ where: { active: true } });
  } catch {
    return;
  }
  const matching = subs.filter((s) => {
    const evs = (s.events as string[] | null) ?? [];
    return evs.includes("*") || evs.includes(event);
  });
  if (!matching.length) return;

  const body = JSON.stringify({ event, at: new Date().toISOString(), data });
  // Fire-and-forget: don't block the request on delivery.
  for (const s of matching) void deliver(s, event, body);
}
