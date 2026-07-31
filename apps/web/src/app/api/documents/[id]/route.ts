import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument } from "@/lib/documents";
import { deleteDocumentHard } from "@/lib/delete-resources";

export const dynamic = "force-dynamic";

/** Move a document into a collection (or to the top level), optionally rename. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDocument(actor, id, "EDIT"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { collectionParentId?: string | null; title?: string };
  const data: { collectionParentId?: string | null; title?: string } = {};

  if ("collectionParentId" in body) {
    const targetId = body.collectionParentId?.trim() || null;
    if (targetId) {
      if (targetId === id) return NextResponse.json({ error: "cannot move into itself" }, { status: 400 });
      const target = await prisma.document.findUnique({ where: { id: targetId }, select: { id: true, kind: true } });
      if (!target || target.kind !== "COLLECTION") {
        return NextResponse.json({ error: "target is not a collection" }, { status: 400 });
      }
      // Prevent cycles: the target must not be a descendant of this document.
      let cursor: string | null = targetId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === id) return NextResponse.json({ error: "cannot move a collection into its own descendant" }, { status: 400 });
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const parent: { collectionParentId: string | null } | null = await prisma.document.findUnique({
          where: { id: cursor },
          select: { collectionParentId: true },
        });
        cursor = parent?.collectionParentId ?? null;
      }
    }
    data.collectionParentId = targetId;
  }

  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "nothing to update" }, { status: 400 });

  const updated = await prisma.document.update({ where: { id }, data });
  await recordAudit({
    action: "document.move",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { collectionParentId: data.collectionParentId ?? null },
  });
  return NextResponse.json({ id: updated.id, collectionParentId: updated.collectionParentId, title: updated.title });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const actor = { id: session.user.id, role: session.user.role };
  if (!(await canAccessDocument(actor, id, "MANAGE"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await deleteDocumentHard(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "cannot delete document";
    const status = msg.includes("not found") ? 404 : 409;
    return NextResponse.json({ error: msg }, { status });
  }

  await recordAudit({
    action: "document.delete",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
