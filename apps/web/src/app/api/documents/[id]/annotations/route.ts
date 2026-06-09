import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument } from "@/lib/documents";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["HIGHLIGHT", "COMMENT", "NOTE", "STRIKEOUT", "DRAWING"];

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDocument(actor, id, "VIEW"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await prisma.annotation.findMany({
    where: { documentId: id },
    orderBy: [{ page: "asc" }, { createdAt: "asc" }],
    include: { author: { select: { email: true } } },
  });

  return NextResponse.json({
    annotations: rows.map((a) => ({
      id: a.id,
      page: a.page,
      type: a.type,
      rect: a.rect,
      color: a.color,
      text: a.text,
      resolved: a.resolved,
      authorId: a.authorId,
      authorEmail: a.author.email,
      createdAt: a.createdAt,
    })),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDocument(actor, id, "COMMENT"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    page?: number;
    type?: string;
    rect?: unknown;
    text?: string;
    color?: string;
  };
  const type = String(body.type ?? "COMMENT").toUpperCase();
  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: `invalid type: ${type}` }, { status: 400 });
  }

  const ann = await prisma.annotation.create({
    data: {
      documentId: id,
      page: Math.max(1, Number(body.page ?? 1)),
      type,
      rect: (body.rect ?? undefined) as Prisma.InputJsonValue | undefined,
      color: body.color ?? "#ffd54f",
      text: body.text ?? null,
      authorId: actor.id,
    },
  });

  await recordAudit({
    action: "annotation.create",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { annotationId: ann.id, type, page: ann.page },
  });

  return NextResponse.json({ id: ann.id });
}
