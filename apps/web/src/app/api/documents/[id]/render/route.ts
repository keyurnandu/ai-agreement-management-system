import { auth } from "@/lib/auth";
import { pdfEngine } from "@/lib/services/client";
import { canAccessDocument, latestVersion, loadVersionBytes } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDocument(actor, id, "VIEW"))) return new Response("forbidden", { status: 403 });

  const version = await latestVersion(id);
  if (!version) return new Response("not found", { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const dpi = Number(url.searchParams.get("dpi") ?? 144);

  const bytes = await loadVersionBytes(version.storageKey);
  const { png, pageCount } = await pdfEngine.render(bytes, version.originalFilename ?? undefined, page, dpi);

  return new Response(new Uint8Array(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "private, no-store",
      "x-page-count": String(pageCount || version.pageCount),
    },
  });
}
