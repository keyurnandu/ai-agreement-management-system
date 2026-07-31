import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { deleteProduct, updateProduct, type MasterProductInput } from "@/lib/master-data";

export const dynamic = "force-dynamic";

/** Edit a catalog product (corrects extraction errors on procurement rows too). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "EDITOR")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.masterProduct.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as MasterProductInput;
  const product = await updateProduct(id, body);
  await recordAudit({
    action: "masterdata.product.update",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "MASTER_PRODUCT",
    resourceId: id,
  });
  return NextResponse.json({ product });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "EDITOR")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.masterProduct.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await deleteProduct(id);
  await recordAudit({
    action: "masterdata.product.delete",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "MASTER_PRODUCT",
    resourceId: id,
  });
  return NextResponse.json({ ok: true });
}
