import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/adapters/storage";
import { canAccessDocument } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const session = await auth();
  if (!session?.user) return new Response("unauthorized", { status: 401 });

  const { key: parts } = await ctx.params;
  const key = parts.map(decodeURIComponent).join("/");

  const version = await prisma.documentVersion.findFirst({ where: { storageKey: key } });
  if (!version) return new Response("not found", { status: 404 });

  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDocument(actor, version.documentId, "VIEW"))) {
    return new Response("forbidden", { status: 403 });
  }

  const bytes = await storage().get(key);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": version.contentType,
      "content-disposition": `inline; filename="${version.originalFilename ?? "document.pdf"}"`,
      "cache-control": "private, no-store",
    },
  });
}
