import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const TYPES = ["TEXT", "DATE", "NUMBER", "BOOLEAN", "ENUM"];
const MODES = ["STRICT", "FLEXIBLE"];

function slugKey(label: string): string {
  return (
    label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) ||
    `attr_${Date.now()}`
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await prisma.attributeDefinition.findMany({ orderBy: [{ group: "asc" }, { label: "asc" }] });
  return NextResponse.json({
    attributes: rows.map((d) => ({
      id: d.id,
      key: d.key,
      label: d.label,
      group: d.group,
      type: d.type,
      documentType: d.documentType,
      mode: d.mode,
      prompt: d.prompt,
      inclusionExamples: d.inclusionExamples ?? [],
      exclusionExamples: d.exclusionExamples ?? [],
      scope: d.scope,
      active: d.active,
      updatedAt: d.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };
  if (!roleAtLeast(actor.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json()) as Record<string, unknown>;
  const label = String(b.label ?? "").trim();
  const prompt = String(b.prompt ?? "").trim();
  if (!label) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!prompt) return NextResponse.json({ error: "description is required" }, { status: 400 });
  const type = String(b.type ?? "TEXT").toUpperCase();
  if (!TYPES.includes(type)) return NextResponse.json({ error: `invalid type: ${type}` }, { status: 400 });
  const mode = String(b.mode ?? "STRICT").toUpperCase();
  if (!MODES.includes(mode)) return NextResponse.json({ error: `invalid mode: ${mode}` }, { status: 400 });

  try {
    const row = await prisma.attributeDefinition.create({
      data: {
        key: (b.key ? String(b.key) : slugKey(label)).trim(),
        label,
        group: b.group ? String(b.group) : null,
        type,
        documentType: b.documentType ? String(b.documentType) : null,
        mode,
        prompt,
        inclusionExamples: (b.inclusionExamples ?? undefined) as Prisma.InputJsonValue | undefined,
        exclusionExamples: (b.exclusionExamples ?? undefined) as Prisma.InputJsonValue | undefined,
        scope: String(b.scope ?? "BOTH").toUpperCase(),
      },
    });
    await recordAudit({
      action: "attribute.create",
      actorId: actor.id,
      actorEmail: session.user.email,
      resourceType: "ATTRIBUTE",
      resourceId: row.id,
      metadata: { key: row.key },
    });
    return NextResponse.json({ id: row.id });
  } catch {
    return NextResponse.json({ error: "an attribute with that key already exists" }, { status: 409 });
  }
}
