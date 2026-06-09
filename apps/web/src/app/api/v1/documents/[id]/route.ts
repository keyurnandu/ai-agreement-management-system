import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/apikey";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeApi(req, "documents:read");
  if (a instanceof NextResponse) return a;

  const { id } = await ctx.params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { owner: { select: { email: true } }, versions: { orderBy: { version: "desc" } } },
  });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: doc.id,
    title: doc.title,
    status: doc.status,
    owner: doc.owner.email,
    createdAt: doc.createdAt,
    versions: doc.versions.map((v) => ({
      version: v.version,
      pageCount: v.pageCount,
      byteSize: v.byteSize,
      note: v.note,
      createdAt: v.createdAt,
    })),
  });
}
