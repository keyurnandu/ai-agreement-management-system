import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { canAccessDeal } from "@/lib/procurement";
import { importProcurementProductsFromDeal } from "@/lib/master-data";

export const dynamic = "force-dynamic";

/**
 * Extract product-level line items from a procurement deal's (signed) document
 * into the Procurement master-data catalog. Normally runs automatically on
 * signing; this endpoint lets a user (re-)run it on demand. `replace: true`
 * refreshes a prior AI import.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "EDITOR")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const actor = { id: session.user.id, role: session.user.role, email: session.user.email };
  if (!(await canAccessDeal(actor, id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const deal = await prisma.deal.findUnique({
    where: { id },
    select: { id: true, documentId: true, vendorName: true, direction: true, commercialId: true },
  });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deal.direction !== "ORG_BUYING") {
    return NextResponse.json({ error: "Product import is for procurement deals only." }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { replace?: boolean };
  const result = await importProcurementProductsFromDeal(
    { id: deal.id, documentId: deal.documentId, vendorName: deal.vendorName, direction: deal.direction },
    session.user.id,
    { replace: body.replace ?? true },
  );

  await recordAudit({
    action: "masterdata.import",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DEAL",
    resourceId: deal.id,
    metadata: { imported: result.imported },
  });

  const message = result.imported
    ? `Imported ${result.imported} product${result.imported === 1 ? "" : "s"} into the procurement catalog.`
    : result.alreadyImported
      ? "Already imported for this deal."
      : result.note ?? "No products found to import.";
  return NextResponse.json({ ...result, message });
}
