import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { softDeleteRulePack } from "@/lib/delete-resources";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    await softDeleteRulePack(id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "not found";
    return NextResponse.json({ error: msg }, { status: 404 });
  }

  await recordAudit({
    action: "rule_pack.delete",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "RULE_PACK",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
