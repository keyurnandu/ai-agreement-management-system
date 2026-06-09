import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine } from "@/lib/services/client";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { documentStorageKey } from "@/lib/documents";
import { composeLines } from "@/lib/authoring";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const c = await prisma.contract.findUnique({ where: { id }, include: { clauses: { orderBy: { order: "asc" } } } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(roleAtLeast(actor.role, "MANAGER") || c.createdById === actor.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Render the structured contract to a PDF (the document is a projection of the data).
  const lines = composeLines(c.clauses);
  const { pdf } = await pdfEngine.textPage(c.title, lines);
  const info = await pdfEngine.info(pdf);

  const doc = await prisma.document.create({ data: { title: c.title, ownerId: actor.id } });
  const key = documentStorageKey(doc.id, 1);
  await storage().put(key, pdf, "application/pdf");
  await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      version: 1,
      storageKey: key,
      byteSize: pdf.byteLength,
      pageCount: info.pages ?? 1,
      originalFilename: `${c.title}.pdf`,
      createdById: actor.id,
      note: "generated from template",
    },
  });

  await prisma.contract.update({ where: { id }, data: { documentId: doc.id, status: "GENERATED" } });
  await recordAudit({
    action: "contract.generate",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "CONTRACT",
    resourceId: id,
    metadata: { documentId: doc.id, pages: info.pages },
  });

  return NextResponse.json({ documentId: doc.id });
}
