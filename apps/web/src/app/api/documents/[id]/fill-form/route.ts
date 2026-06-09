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

  const body = (await req.json()) as { values?: Record<string, string> };
  if (!body.values || typeof body.values !== "object") {
    return NextResponse.json({ error: "values required" }, { status: 400 });
  }

  const current = await latestVersion(id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bytes = await loadVersionBytes(current.storageKey);
  const { pdf, fieldsFilled } = await pdfEngine.fillForm(bytes, current.originalFilename ?? undefined, body.values);

  const newVersion = current.version + 1;
  const key = documentStorageKey(id, newVersion);
  await storage().put(key, pdf, "application/pdf");

  await prisma.documentVersion.create({
    data: {
      documentId: id,
      version: newVersion,
      storageKey: key,
      byteSize: pdf.byteLength,
      pageCount: current.pageCount,
      originalFilename: current.originalFilename,
      createdById: actor.id,
      note: `filled ${fieldsFilled} form field(s)`,
    },
  });
  await prisma.document.update({ where: { id }, data: { updatedAt: new Date() } });

  await recordAudit({
    action: "document.fill_form",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { newVersion, fieldsFilled },
  });

  return NextResponse.json({ version: newVersion, fieldsFilled });
}
