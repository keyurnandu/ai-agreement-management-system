import { prisma } from "@/lib/db";
import { pdfEngine } from "@/lib/services/client";
import { latestVersion, loadVersionBytes } from "@/lib/documents";

export const dynamic = "force-dynamic";

// Public, token-gated render of the agreement's document page.
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const r = await prisma.recipient.findUnique({ where: { accessToken: token }, include: { agreement: true } });
  if (!r) return new Response("invalid link", { status: 404 });

  const version = await latestVersion(r.agreement.documentId);
  if (!version) return new Response("not found", { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const dpi = Number(url.searchParams.get("dpi") ?? 144);

  const bytes = await loadVersionBytes(version.storageKey);
  const { png, pageCount } = await pdfEngine.render(bytes, version.originalFilename ?? undefined, page, dpi);
  return new Response(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "private, no-store", "x-page-count": String(pageCount) },
  });
}
