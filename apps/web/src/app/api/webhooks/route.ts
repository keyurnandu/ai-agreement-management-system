import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await prisma.webhookSubscription.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({
    events: WEBHOOK_EVENTS,
    webhooks: rows.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events ?? [],
      active: w.active,
      lastStatus: w.lastStatus,
      lastDeliveryAt: w.lastDeliveryAt,
      createdAt: w.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };
  if (!roleAtLeast(actor.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json()) as { url?: string; events?: string[] };
  if (!b.url?.trim() || !/^https?:\/\//.test(b.url)) {
    return NextResponse.json({ error: "valid http(s) url required" }, { status: 400 });
  }
  const events = Array.isArray(b.events) && b.events.length ? b.events : ["*"];
  const secret = randomBytes(24).toString("base64url");

  const rec = await prisma.webhookSubscription.create({
    data: { url: b.url.trim(), events: events as Prisma.InputJsonValue, secret, createdById: actor.id },
  });
  await recordAudit({
    action: "webhook.create",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "WEBHOOK",
    resourceId: rec.id,
    metadata: { url: rec.url, events },
  });
  // Secret returned ONCE for HMAC verification on the receiver side.
  return NextResponse.json({ id: rec.id, secret });
}
