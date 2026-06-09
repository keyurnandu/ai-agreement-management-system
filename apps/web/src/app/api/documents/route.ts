import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine } from "@/lib/services/client";
import { recordAudit } from "@/lib/audit";
import { documentStorageKey } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // Authoritative check is the PDF magic number — client-supplied MIME types are
  // unreliable (browsers send application/pdf, other clients send octet-stream).
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return NextResponse.json({ error: "file is not a valid PDF" }, { status: 415 });
  }

  const doc = await prisma.document.create({
    data: {
      title: title || file.name.replace(/\.pdf$/i, "") || "Untitled",
      ownerId: session.user.id,
    },
  });

  const key = documentStorageKey(doc.id, 1);
  await storage().put(key, bytes, "application/pdf");

  let pageCount = 0;
  try {
    const info = await pdfEngine.info(bytes, file.name);
    pageCount = Number(info.pages ?? 0);
  } catch {
    /* engine optional at upload time; page count can be backfilled */
  }

  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      version: 1,
      storageKey: key,
      byteSize: bytes.byteLength,
      pageCount,
      originalFilename: file.name,
      createdById: session.user.id,
      note: "initial upload",
    },
  });

  await recordAudit({
    action: "document.upload",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: doc.id,
    metadata: { filename: file.name, bytes: bytes.byteLength, pageCount },
  });

  return NextResponse.json({ id: doc.id, title: doc.title, pageCount });
}
