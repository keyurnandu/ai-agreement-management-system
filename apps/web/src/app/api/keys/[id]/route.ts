import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };
  if (!roleAtLeast(actor.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  await prisma.apiKey.delete({ where: { id } }).catch(() => {});
  await recordAudit({
    action: "apikey.revoke",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "APIKEY",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
