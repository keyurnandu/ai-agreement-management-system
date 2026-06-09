import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { emitEvent } from "@/lib/webhooks";
import { pdfEngine, intelligence } from "@/lib/services/client";
import { canAccessDocument, latestVersion, loadVersionBytes } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "EDIT"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const version = await latestVersion(id);
  if (!version) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bytes = await loadVersionBytes(version.storageKey);
  const extracted = await pdfEngine.extractText(bytes, version.originalFilename ?? undefined);
  const text = extracted.pages.map((p) => p.text).join("\n");

  const defs = await prisma.attributeDefinition.findMany({
    where: { active: true, scope: { in: ["DOCUMENT", "BOTH"] } },
  });
  if (defs.length === 0) return NextResponse.json({ extracted: 0 });

  const { provider, values } = await intelligence.extract(
    text,
    defs.map((d) => ({
      key: d.key,
      label: d.label,
      type: d.type,
      prompt: d.prompt,
      mode: d.mode,
      inclusion: (d.inclusionExamples as string[] | null) ?? [],
      exclusion: (d.exclusionExamples as string[] | null) ?? [],
    })),
  );
  const byKey = new Map(values.map((v) => [v.key, v]));

  for (const d of defs) {
    const v = byKey.get(d.key);
    // Replace prior AI-extracted value; leave any MANUAL value untouched.
    await prisma.attributeValue.deleteMany({ where: { definitionId: d.id, documentId: id, method: "AI" } });
    await prisma.attributeValue.create({
      data: {
        definitionId: d.id,
        documentId: id,
        value: v?.value ?? null,
        confidence: v?.confidence ?? null,
        method: "AI",
        source: provider,
      },
    });
  }

  await recordAudit({
    action: "document.extract",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { count: defs.length, provider },
  });
  await emitEvent("attribute.extracted", { documentId: id, count: defs.length, provider });

  return NextResponse.json({ extracted: defs.length, provider });
}
