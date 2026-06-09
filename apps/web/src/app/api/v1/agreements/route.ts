import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/apikey";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const a = await authorizeApi(req, "agreements:read");
  if (a instanceof NextResponse) return a;

  const ags = await prisma.agreement.findMany({
    orderBy: { updatedAt: "desc" },
    include: { recipients: { select: { status: true } } },
    take: 200,
  });
  return NextResponse.json({
    agreements: ags.map((ag) => ({
      id: ag.id,
      title: ag.title,
      status: ag.status,
      routingType: ag.routingType,
      recipients: ag.recipients.length,
      signed: ag.recipients.filter((r) => r.status === "SIGNED").length,
      sentAt: ag.sentAt,
      completedAt: ag.completedAt,
    })),
  });
}
