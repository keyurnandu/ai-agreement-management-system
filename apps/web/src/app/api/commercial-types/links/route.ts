import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Add an allowed parent → child hierarchy link */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { parentTypeId?: string; childTypeId?: string };
  if (!body.parentTypeId || !body.childTypeId) {
    return NextResponse.json({ error: "parentTypeId and childTypeId required" }, { status: 400 });
  }

  const [parent, child] = await Promise.all([
    prisma.commercialRecordType.findUnique({ where: { id: body.parentTypeId } }),
    prisma.commercialRecordType.findUnique({ where: { id: body.childTypeId } }),
  ]);
  if (!parent || !child) return NextResponse.json({ error: "type not found" }, { status: 404 });
  if (parent.direction !== child.direction) {
    return NextResponse.json({ error: "parent and child must share direction" }, { status: 400 });
  }

  await prisma.commercialTypeLink.upsert({
    where: {
      parentTypeId_childTypeId: { parentTypeId: body.parentTypeId, childTypeId: body.childTypeId },
    },
    create: { parentTypeId: body.parentTypeId, childTypeId: body.childTypeId },
    update: {},
  });

  await prisma.commercialRecordType.update({
    where: { id: body.childTypeId },
    data: { isRoot: false },
  });

  await recordAudit({
    action: "commercial_type.link",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "COMMERCIAL_TYPE",
    resourceId: body.childTypeId,
    metadata: { parentTypeId: body.parentTypeId },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { parentTypeId?: string; childTypeId?: string };
  if (!body.parentTypeId || !body.childTypeId) {
    return NextResponse.json({ error: "parentTypeId and childTypeId required" }, { status: 400 });
  }

  const child = await prisma.commercialRecordType.findUnique({
    where: { id: body.childTypeId },
    include: { parentLinks: true },
  });
  if (child?.system && child.parentLinks.length <= 1) {
    return NextResponse.json({ error: "cannot remove last link on a system type" }, { status: 409 });
  }

  await prisma.commercialTypeLink.deleteMany({
    where: { parentTypeId: body.parentTypeId, childTypeId: body.childTypeId },
  });

  return NextResponse.json({ ok: true });
}
