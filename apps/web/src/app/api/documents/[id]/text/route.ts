import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pdfEngine } from "@/lib/services/client";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument, latestVersion, loadVersionBytes } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDocument(actor, id, "VIEW"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const version = await latestVersion(id);
  if (!version) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bytes = await loadVersionBytes(version.storageKey);
  const extracted = await pdfEngine.extractText(bytes, version.originalFilename ?? undefined);

  await recordAudit({
    action: "document.extract_text",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { chars: extracted.char_count, version: version.version },
  });

  return NextResponse.json(extracted);
}
