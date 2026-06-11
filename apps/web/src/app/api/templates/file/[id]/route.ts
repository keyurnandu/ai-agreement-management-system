import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { softDeleteFileTemplate } from "@/lib/delete-resources";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    await softDeleteFileTemplate(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "not found";
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  await recordAudit({
    action: "template.delete",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "FILE_TEMPLATE",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
