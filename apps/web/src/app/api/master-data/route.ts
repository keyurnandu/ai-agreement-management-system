import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { createProduct, listProducts, normalizeSide, type MasterProductInput } from "@/lib/master-data";

export const dynamic = "force-dynamic";

/** List the product catalog. `?side=SALES|PROCUREMENT` and `?q=` filter it. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sideParam = url.searchParams.get("side");
  const side = sideParam === "SALES" || sideParam === "PROCUREMENT" ? sideParam : undefined;
  const q = url.searchParams.get("q") ?? undefined;

  const products = await listProducts({ side, q });

  // Attach a human source label/link for AI-imported (procurement) rows.
  const dealIds = [...new Set(products.map((p) => p.sourceDealId).filter((x): x is string => !!x))];
  const deals = dealIds.length
    ? await prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, commercialId: true, title: true } })
    : [];
  const dealMap = new Map(deals.map((d) => [d.id, d]));
  const enriched = products.map((p) => {
    const deal = p.sourceDealId ? dealMap.get(p.sourceDealId) : null;
    return {
      ...p,
      sourceLabel: deal ? (deal.commercialId ?? deal.title) : p.sourceDocumentId ? "Imported" : null,
      sourceHref: deal ? `/deals/${deal.id}` : null,
    };
  });
  return NextResponse.json({ products: enriched, canEdit: roleAtLeast(session.user.role, "EDITOR") });
}

/** Create a catalog product (manual entry). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "EDITOR")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
  if (!owner) return NextResponse.json({ error: "Your session is out of date — please sign out and sign in again." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as MasterProductInput;
  if (!body.name?.trim()) return NextResponse.json({ error: "Product name is required." }, { status: 400 });

  const product = await createProduct(body, session.user.id);
  await recordAudit({
    action: "masterdata.product.create",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "MASTER_PRODUCT",
    resourceId: product.id,
    metadata: { side: normalizeSide(body.side), name: product.name },
  });
  return NextResponse.json({ product });
}
