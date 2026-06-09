import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/apikey";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeApi(req, "attributes:read");
  if (a instanceof NextResponse) return a;

  const { id } = await ctx.params;
  const defs = await prisma.attributeDefinition.findMany({
    where: { active: true },
    select: { id: true, key: true, label: true, type: true },
  });
  const vals = await prisma.attributeValue.findMany({ where: { documentId: id } });
  const byDef = new Map<string, (typeof vals)[number]>();
  for (const v of vals) {
    const cur = byDef.get(v.definitionId);
    if (!cur || (v.method === "MANUAL" && cur.method !== "MANUAL")) byDef.set(v.definitionId, v);
  }

  return NextResponse.json({
    documentId: id,
    attributes: defs
      .map((d) => {
        const v = byDef.get(d.id);
        return v ? { key: d.key, label: d.label, type: d.type, value: v.value, confidence: v.confidence, method: v.method } : null;
      })
      .filter(Boolean),
  });
}
