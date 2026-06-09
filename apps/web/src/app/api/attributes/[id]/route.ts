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
  const b = (await req.json()) as Record<string, unknown>;
  const data: Prisma.AttributeDefinitionUpdateInput = {};
  if (b.label !== undefined) data.label = String(b.label);
  if (b.group !== undefined) data.group = b.group === null ? null : String(b.group);
  if (b.type !== undefined) data.type = String(b.type).toUpperCase();
  if (b.documentType !== undefined) data.documentType = b.documentType === null ? null : String(b.documentType);
  if (b.mode !== undefined) data.mode = String(b.mode).toUpperCase();
  if (b.prompt !== undefined) data.prompt = String(b.prompt);
  if (b.inclusionExamples !== undefined) data.inclusionExamples = b.inclusionExamples as Prisma.InputJsonValue;
  if (b.exclusionExamples !== undefined) data.exclusionExamples = b.exclusionExamples as Prisma.InputJsonValue;
  if (b.scope !== undefined) data.scope = String(b.scope).toUpperCase();
  if (typeof b.active === "boolean") data.active = b.active;

  await prisma.attributeDefinition.update({ where: { id }, data });
  await recordAudit({
    action: "attribute.update",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "ATTRIBUTE",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
