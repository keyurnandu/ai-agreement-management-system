import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument } from "@/lib/documents";
import { deleteDocumentHard } from "@/lib/delete-resources";

export const dynamic = "force-dynamic";

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
