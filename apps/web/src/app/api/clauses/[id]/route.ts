import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };
  if (!roleAtLeast(actor.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  const b = (await req.json()) as {
    title?: string;
    category?: string | null;
    body?: string;
    fallbacks?: unknown;
    active?: boolean;
  };

  const data: Prisma.ClauseLibraryEntryUpdateInput = {};
  if (b.title !== undefined) data.title = b.title;
  if (b.category !== undefined) data.category = b.category;
  if (b.body !== undefined) data.body = b.body;
  if (b.fallbacks !== undefined) data.fallbacks = b.fallbacks as Prisma.InputJsonValue;
  if (typeof b.active === "boolean") data.active = b.active;

  await prisma.clauseLibraryEntry.update({ where: { id }, data });
  await recordAudit({
    action: "clause.update",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "CLAUSE",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
