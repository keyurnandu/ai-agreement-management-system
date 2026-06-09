import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine } from "@/lib/services/client";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument, documentStorageKey, latestVersion, loadVersionBytes } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };
  // Splitting produces a NEW document owned by the actor — anyone who can view may do it.
  if (!(await canAccessDocument(actor, id, "VIEW"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { ranges?: string; title?: string };
  if (!body.ranges || !body.ranges.trim()) {
    return NextResponse.json({ error: "ranges required (e.g. '1-3,5')" }, { status: 400 });
  }

  const current = await latestVersion(id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const base = await loadVersionBytes(current.storageKey);
  const { pdf, pageCount } = await pdfEngine.split(base, current.originalFilename ?? undefined, body.ranges);

  const src = await prisma.document.findUnique({ where: { id }, select: { title: true } });
  const newDoc = await prisma.document.create({
    data: {
      title: body.title?.trim() || `${src?.title ?? "Document"} (pages ${body.ranges})`,
      ownerId: actor.id,
    },
  });

  const key = documentStorageKey(newDoc.id, 1);
  await storage().put(key, pdf, "application/pdf");
  await prisma.documentVersion.create({
    data: {
      documentId: newDoc.id,
      version: 1,
      storageKey: key,
      byteSize: pdf.byteLength,
      pageCount,
      originalFilename: current.originalFilename,
      createdById: actor.id,
      note: `split from ${id} (pages ${body.ranges})`,
    },
  });

  await recordAudit({
    action: "document.split",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { newDocumentId: newDoc.id, ranges: body.ranges, pageCount },
  });

  return NextResponse.json({ id: newDoc.id, pageCount });
}
