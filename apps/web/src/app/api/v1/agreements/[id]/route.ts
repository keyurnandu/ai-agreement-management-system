import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/apikey";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const a = await authorizeApi(req, "agreements:read");
  if (a instanceof NextResponse) return a;

  const { id } = await ctx.params;
  const ag = await prisma.agreement.findUnique({
    where: { id },
    include: { recipients: { orderBy: { routingOrder: "asc" } } },
  });
  if (!ag) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    id: ag.id,
    title: ag.title,
    status: ag.status,
    routingType: ag.routingType,
    documentId: ag.documentId,
    sentAt: ag.sentAt,
    completedAt: ag.completedAt,
    recipients: ag.recipients.map((r) => ({
      email: r.email,
      name: r.name,
      role: r.role,
      routingOrder: r.routingOrder,
      status: r.status,
      signedAt: r.signedAt,
    })),
  });
}
