import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { DocumentsHierarchy } from "@/components/DocumentsHierarchy";
import { DocumentsPageActions } from "@/components/DocumentsPageActions";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) return null;
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

  const initialDocs = docs.map((d) => {
    const v = d.versions[0];
    return {
      id: d.id,
      commercialId: d.commercialId,
      kind: d.kind,
      collectionParentId: d.collectionParentId,
      typePrefix: d.commercialType?.prefix ?? null,
      title: d.title,
      ownerEmail: d.owner.email,
      pageCount: v?.pageCount ?? (d.kind === "COLLECTION" ? "—" : 0),
      version: v?.version ?? 0,
      updatedAt: d.updatedAt.toLocaleString(),
    };
  });

  return (
    <div className="container">
      <div className="row" style={{ marginBottom: 20 }}>
        <div>
          <Link href="/dashboard" className="muted" style={{ fontSize: 13 }}>
            ← dashboard
          </Link>
          <h1 style={{ marginTop: 6 }}>Documents</h1>
          <p className="muted" style={{ fontSize: 13 }}>
            PDF library &amp; collections — separate from Deals and Contracts. Use DCOL folders to group DPDF files.
          </p>
        </div>
        <DocumentsPageActions />
      </div>

      <DocumentsHierarchy initialDocs={initialDocs} isAdmin={roleAtLeast(role, "ADMIN")} />
    </div>
  );
}
