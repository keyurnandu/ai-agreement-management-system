import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { latestVersion, loadVersionBytes } from "@/lib/documents";
import { pdfEngine } from "@/lib/services/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const deal = await prisma.deal.findUnique({ where: { vendorAccessToken: token } });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  const dpi = Math.min(200, Math.max(72, Number(url.searchParams.get("dpi") ?? 120)));

  const version = await latestVersion(deal.documentId);
  if (!version) return NextResponse.json({ error: "no document" }, { status: 404 });

  const bytes = await loadVersionBytes(version.storageKey);
  const { png } = await pdfEngine.render(bytes, version.originalFilename ?? undefined, page, dpi);

  return new NextResponse(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}
