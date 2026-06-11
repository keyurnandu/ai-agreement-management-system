import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import {
  allocateCommercialId,
  getCommercialType,
  getCommercialTypeByKey,
  validateParentForType,
} from "@/lib/commercial-types";

export const dynamic = "force-dynamic";

/** Create a document collection (folder) — PDFs only; collections stay in Documents. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "EDITOR")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    title?: string;
    collectionParentId?: string;
    commercialTypeId?: string;
  };

  const typeId = body.commercialTypeId;
  let commercialType = typeId ? await getCommercialType(typeId) : null;
  if (!commercialType) {
    commercialType = await getCommercialTypeByKey("dcol");
  }
  if (!commercialType || commercialType.domain !== "DOCUMENT") {
    return NextResponse.json({ error: "invalid collection type" }, { status: 400 });
  }

  const parentId = body.collectionParentId?.trim() || null;
  if (parentId) {
    const check = await validateParentForType(parentId, commercialType.id, "DOCUMENT");
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const commercialId = await allocateCommercialId(commercialType.prefix);

  const doc = await prisma.document.create({
    data: {
      title: body.title?.trim() || `Collection ${commercialId}`,
      kind: "COLLECTION",
      commercialId,
      commercialTypeId: commercialType.id,
      collectionParentId: parentId,
      ownerId: session.user.id,
    },
  });

  await recordAudit({
    action: "document.collection.create",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: doc.id,
    metadata: { commercialId },
  });

  return NextResponse.json({ id: doc.id, commercialId });
}
