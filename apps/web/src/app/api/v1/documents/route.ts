import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/apikey";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await authorizeApi(req, "documents:read");
  if (a instanceof NextResponse) return a;

  const docs = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    take: 200,
  });
  return NextResponse.json({
    documents: docs.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      version: d.versions[0]?.version ?? 0,
      pageCount: d.versions[0]?.pageCount ?? 0,
      createdAt: d.createdAt,
    })),
  });
}
