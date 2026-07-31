import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { pdfEngine } from "@/lib/services/client";
import { canAccessDocument, latestVersion, loadVersionBytes } from "@/lib/documents";

export const dynamic = "force-dynamic";

/**
 * Locate a value's bounding box on the rendered PDF so "view source" can
 * highlight directly on the contract page (not just the extracted-text view).
 * Used at view-time for sources that were stored without a rect.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "VIEW"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { query?: string; page?: number };
  const query = (body.query ?? "").trim();
  if (!query) return NextResponse.json({ rect: null });

  const version = await latestVersion(id);
  if (!version) return NextResponse.json({ error: "not found" }, { status: 404 });

  const bytes = await loadVersionBytes(version.storageKey);
  const filename = version.originalFilename ?? undefined;
  const page = typeof body.page === "number" && body.page > 0 ? body.page : 0;

  try {
    // Try the claimed page first, then fall back to a whole-document search.
    let { hits } = await pdfEngine.searchText(bytes, filename, query.slice(0, 120), page);
    if (!hits[0] && page > 0) {
      ({ hits } = await pdfEngine.searchText(bytes, filename, query.slice(0, 120), 0));
    }
    const hit = hits[0];
    if (!hit) return NextResponse.json({ rect: null });
    return NextResponse.json({ page: hit.page, rect: { x: hit.x, y: hit.y, w: hit.w, h: hit.h } });
  } catch {
    return NextResponse.json({ rect: null });
  }
}
