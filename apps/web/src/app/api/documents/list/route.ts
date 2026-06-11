import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { typeLabel } from "@/lib/commercial-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id: uid, role } = session.user;

  const where = roleAtLeast(role, "MANAGER")
    ? {}
    : { OR: [{ ownerId: uid }, { permissions: { some: { userId: uid } } }] };

  const docs = await prisma.document.findMany({
    where,
    include: {
      owner: { select: { email: true } },
      commercialType: true,
      versions: { orderBy: { version: "desc" }, take: 1 },
    },
    orderBy: [{ commercialId: "asc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({
    isAdmin: roleAtLeast(role, "ADMIN"),
    documents: docs.map((d) => {
      const v = d.versions[0];
      return {
        id: d.id,
        commercialId: d.commercialId,
        kind: d.kind,
        collectionParentId: d.collectionParentId,
        typePrefix: d.commercialType?.prefix ?? null,
        recordTypeLabel: d.commercialType ? typeLabel(d.commercialType) : null,
        title: d.title,
        ownerEmail: d.owner.email,
        pageCount: v?.pageCount ?? (d.kind === "COLLECTION" ? "—" : 0),
        version: v?.version ?? 0,
        updatedAt: d.updatedAt.toISOString(),
      };
    }),
  });
}
