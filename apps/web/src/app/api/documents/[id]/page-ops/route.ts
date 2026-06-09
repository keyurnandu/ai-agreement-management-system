import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { pdfEngine, type PageOp } from "@/lib/services/client";
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

  const body = (await req.json()) as { ops?: PageOp | PageOp[]; note?: string };
  if (!body.ops) return NextResponse.json({ error: "ops required" }, { status: 400 });

  const current = await latestVersion(id);
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bytes = await loadVersionBytes(current.storageKey);
  const { pdf, pageCount } = await pdfEngine.pageOps(bytes, current.originalFilename ?? undefined, body.ops);

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
      note: body.note ?? "page operation",
    },
  });
  await prisma.document.update({ where: { id }, data: { updatedAt: new Date() } });

  await recordAudit({
    action: "document.page_ops",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { ops: body.ops, newVersion, pageCount },
  });

  return NextResponse.json({ version: newVersion, pageCount });
}
