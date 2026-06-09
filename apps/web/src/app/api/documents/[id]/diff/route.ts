import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { intelligence, pdfEngine } from "@/lib/services/client";
import { canAccessDocument, loadVersionBytes } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "VIEW"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  if (!from || !to) return NextResponse.json({ error: "from and to version numbers required" }, { status: 400 });

  async function versionText(v: number): Promise<string | null> {
    const ver = await prisma.documentVersion.findUnique({ where: { documentId_version: { documentId: id, version: v } } });
    if (!ver) return null;
    const bytes = await loadVersionBytes(ver.storageKey);
    const ex = await pdfEngine.extractText(bytes, ver.originalFilename ?? undefined);
    return ex.pages.map((p) => p.text).join("\n");
  }

  const before = await versionText(from);
  const after = await versionText(to);
  if (before === null || after === null) return NextResponse.json({ error: "version not found" }, { status: 404 });

  const result = await intelligence.diff(before, after);
  await recordAudit({
    action: "document.diff",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { from, to },
  });
  return NextResponse.json(result);
}
