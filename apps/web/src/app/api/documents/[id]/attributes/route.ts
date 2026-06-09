import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "VIEW"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const defs = await prisma.attributeDefinition.findMany({
    where: { active: true, scope: { in: ["DOCUMENT", "BOTH"] } },
    orderBy: { label: "asc" },
  });
  const vals = await prisma.attributeValue.findMany({ where: { documentId: id } });

  // Prefer a MANUAL override over the AI-extracted value.
  const byDef = new Map<string, (typeof vals)[number]>();
  for (const v of vals) {
    const cur = byDef.get(v.definitionId);
    if (!cur || (v.method === "MANUAL" && cur.method !== "MANUAL")) byDef.set(v.definitionId, v);
  }

  return NextResponse.json({
    attributes: defs.map((d) => {
      const v = byDef.get(d.id);
      return {
        key: d.key,
        label: d.label,
        type: d.type,
        prompt: d.prompt,
        value: v?.value ?? null,
        confidence: v?.confidence ?? null,
        method: v?.method ?? null,
      };
    }),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "EDIT"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { key?: string; value?: string };
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });

  const def = await prisma.attributeDefinition.findUnique({ where: { key: body.key } });
  if (!def) return NextResponse.json({ error: "unknown attribute" }, { status: 404 });

  await prisma.attributeValue.deleteMany({ where: { definitionId: def.id, documentId: id } });
  await prisma.attributeValue.create({
    data: { definitionId: def.id, documentId: id, value: body.value ?? null, method: "MANUAL" },
  });

  await recordAudit({
    action: "document.attribute.set",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { key: body.key },
  });

  return NextResponse.json({ ok: true });
}
