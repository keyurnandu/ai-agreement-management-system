import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { emitEvent } from "@/lib/webhooks";
import { roleAtLeast } from "@/lib/rbac";
import { publishContractAsPdf } from "@/lib/contract-pdf";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  const c = await prisma.contract.findUnique({ where: { id }, select: { id: true, createdById: true } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(roleAtLeast(actor.role, "MANAGER") || c.createdById === actor.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const { documentId, pageCount } = await publishContractAsPdf({
      contractId: id,
      actorId: actor.id,
    });
    await recordAudit({
      action: "contract.generate",
      actorId: actor.id,
      actorEmail: session.user.email,
      resourceType: "CONTRACT",
      resourceId: id,
      metadata: { documentId, pages: pageCount },
    });
    await emitEvent("contract.generated", { contractId: id, documentId });
    return NextResponse.json({ documentId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "generate failed" }, { status: 500 });
  }
}
