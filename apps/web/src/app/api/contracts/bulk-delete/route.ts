import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { deleteContractHard } from "@/lib/delete-resources";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "ADMIN")) {
    return NextResponse.json({ error: "admin access required to delete contracts" }, { status: 403 });
  }

  const body = (await req.json()) as { ids?: string[] };
  const ids = [...new Set((body.ids ?? []).filter(Boolean))];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const id of ids) {
    try {
      await deleteContractHard(id);
      deleted.push(id);
      await recordAudit({
        action: "contract.delete",
        actorId: session.user.id,
        actorEmail: session.user.email,
        resourceType: "CONTRACT",
        resourceId: id,
        metadata: { bulk: true },
        ...auditRequestMeta(req),
      });
    } catch (e) {
      failed.push({ id, error: e instanceof Error ? e.message : "delete failed" });
    }
  }

  return NextResponse.json({ deleted: deleted.length, failed, ids: deleted });
}
