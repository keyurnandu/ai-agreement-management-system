import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine } from "@/lib/services/client";
import { documentStorageKey } from "@/lib/documents";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const direction = new URL(req.url).searchParams.get("direction");
  const packs = await prisma.complianceRulePack.findMany({
    where: {
      active: true,
      ...(direction === "ORG_BUYING" || direction === "ORG_SELLING" ? { direction } : {}),
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, direction: true, createdAt: true },
  });
  return NextResponse.json({ packs });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim();
  const rulesText = String(form.get("rulesText") ?? "").trim();
  const directionRaw = String(form.get("direction") ?? "ORG_BUYING");
  const direction = directionRaw === "ORG_SELLING" ? "ORG_SELLING" : "ORG_BUYING";
  const file = form.get("file");

  let documentId: string | null = null;
  let extractedRules = rulesText;

  if (file instanceof File) {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return NextResponse.json({ error: "rules file must be PDF" }, { status: 415 });
    }
    const doc = await prisma.document.create({ data: { title: `${name} rules`, ownerId: session.user.id } });
    const key = documentStorageKey(doc.id, 1);
    await storage().put(key, bytes, "application/pdf");
    await prisma.documentVersion.create({
      data: {
        documentId: doc.id,
        version: 1,
        storageKey: key,
        byteSize: bytes.byteLength,
        createdById: session.user.id,
        note: "compliance rules source",
      },
    });
    documentId = doc.id;
    if (!extractedRules) {
      try {
        const ex = await pdfEngine.extractText(bytes, file.name);
        extractedRules = ex.pages.map((p) => p.text).join("\n").trim().slice(0, 50000);
      } catch {
        return NextResponse.json(
          { error: "Could not extract text from PDF — paste rules in the text box or ensure pdf-engine is running." },
          { status: 502 },
        );
      }
    }
  }

  if (!name) {
    return NextResponse.json({ error: "pack name is required" }, { status: 400 });
  }
  if (!extractedRules) {
    return NextResponse.json(
      { error: "rules required — paste text and/or upload a PDF with readable text" },
      { status: 400 },
    );
  }

  const pack = await prisma.complianceRulePack.create({
    data: { name, direction, documentId, rulesText: extractedRules, createdById: session.user.id },
  });

  return NextResponse.json({ id: pack.id });
}
