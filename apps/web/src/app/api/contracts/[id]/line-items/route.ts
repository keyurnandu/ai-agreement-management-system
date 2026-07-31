import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { normalizeLineItems, lineItemTotals } from "@/lib/master-data";

export const dynamic = "force-dynamic";

async function loadContract(id: string) {
  return prisma.contract.findUnique({ where: { id }, select: { id: true, createdById: true, lineItems: true } });
}

/** Current line items on a contract. Same access rule as the rest of the
 * contract's data: a manager or the contract's creator. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const c = await loadContract(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  const canEdit = roleAtLeast(session.user.role, "MANAGER") || c.createdById === session.user.id;
  if (!canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const items = normalizeLineItems(c.lineItems);
  return NextResponse.json({ items, totals: lineItemTotals(items), canEdit });
}

/** Replace the contract's line items (the sales product picker saves the whole list). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await params;
  const c = await loadContract(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!(roleAtLeast(actor.role, "MANAGER") || c.createdById === actor.id)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { items?: unknown };
  const items = normalizeLineItems(body.items);
  await prisma.contract.update({ where: { id }, data: { lineItems: items } });
  await recordAudit({
    action: "contract.line_items.update",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "CONTRACT",
    resourceId: id,
    metadata: { count: items.length },
  });
  return NextResponse.json({ items, totals: lineItemTotals(items) });
}
