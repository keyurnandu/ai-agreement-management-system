import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";

export const WEBHOOK_EVENTS = ["agreement.completed", "attribute.extracted", "document.uploaded", "contract.generated"];

/**
 * Fire an event to all matching active webhook subscriptions. Best-effort: each
 * delivery is signed (HMAC-SHA256) and its status recorded; failures don't throw.
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
  await Promise.all(
    matching.map(async (s) => {
      try {
        const sig = createHmac("sha256", s.secret).update(body).digest("hex");
        const res = await fetch(s.url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-cp-event": event, "x-cp-signature": `sha256=${sig}` },
          body,
          signal: AbortSignal.timeout(5000),
        });
        await prisma.webhookSubscription.update({
          where: { id: s.id },
          data: { lastStatus: res.status, lastDeliveryAt: new Date() },
        });
      } catch {
        await prisma.webhookSubscription
          .update({ where: { id: s.id }, data: { lastStatus: 0, lastDeliveryAt: new Date() } })
          .catch(() => {});
      }
    }),
  );
}
