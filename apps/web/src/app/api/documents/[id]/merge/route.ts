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
  if (!(await canAccessDocument(actor, id, "EDIT"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });

  const incoming = Buffer.from(await file.arrayBuffer());
  if (incoming.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "file is not a valid PDF" }, { status: 415 });
  }

  const current = await latestVersion(id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const base = await loadVersionBytes(current.storageKey);
  const { pdf, pageCount } = await pdfEngine.merge([
    { bytes: base, filename: current.originalFilename ?? "current.pdf" },
    { bytes: incoming, filename: file.name },
  ]);

  const newVersion = current.version + 1;
  const key = documentStorageKey(id, newVersion);
  await storage().put(key, pdf, "application/pdf");

  await prisma.documentVersion.create({
    data: {
      documentId: id,
      version: newVersion,
      storageKey: key,
      byteSize: pdf.byteLength,
      pageCount,
      originalFilename: current.originalFilename,
      createdById: actor.id,
      note: `merged in ${file.name}`,
    },
  });
  await prisma.document.update({ where: { id }, data: { updatedAt: new Date() } });

  await recordAudit({
    action: "document.merge",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { newVersion, pageCount, merged: file.name },
  });

  return NextResponse.json({ version: newVersion, pageCount });
}
