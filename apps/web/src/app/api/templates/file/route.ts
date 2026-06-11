import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine } from "@/lib/services/client";
import { documentStorageKey } from "@/lib/documents";
import { roleAtLeast } from "@/lib/rbac";
import { templateFileToPdf } from "@/lib/docx-to-pdf";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await prisma.fileTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ templates: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const name = String(form.get("name") ?? "").trim();
  const direction = String(form.get("direction") ?? "ORG_SELLING");
  const description = String(form.get("description") ?? "").trim();

  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  const rawBytes = Buffer.from(await file.arrayBuffer());
  const title = name || file.name.replace(/\.(pdf|docx)$/i, "");
  let bytes: Buffer;
  try {
    bytes = await templateFileToPdf(rawBytes, file.name, title);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unsupported format";
    return NextResponse.json({ error: msg }, { status: 415 });
  }

  const doc = await prisma.document.create({
    data: { title: name || file.name, ownerId: session.user.id, description: "file template master" },
  });
  const key = documentStorageKey(doc.id, 1);
  await storage().put(key, bytes, "application/pdf");
  let pageCount = 0;
  try {
    pageCount = Number((await pdfEngine.info(bytes, file.name)).pages ?? 0);
  } catch {
    /* optional */
  }
  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      version: 1,
      storageKey: key,
      byteSize: bytes.byteLength,
      pageCount,
      originalFilename: file.name.endsWith(".docx") ? `${title}.pdf` : file.name,
      createdById: session.user.id,
      note: "template master",
    },
  });

  const tpl = await prisma.fileTemplate.create({
    data: {
      name: name || file.name.replace(/\.pdf$/i, ""),
      description: description || null,
      documentId: doc.id,
      direction: direction === "ORG_BUYING" ? "ORG_BUYING" : "ORG_SELLING",
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ id: tpl.id });
}
