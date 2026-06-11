import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = (await req.json()) as {
    name?: string;
    description?: string;
    active?: boolean;
    parentTypeIds?: string[];
  };

  const type = await prisma.commercialRecordType.findUnique({ where: { id } });
  if (!type) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.commercialRecordType.update({
    where: { id },
    data: {
      name: body.name?.trim() || undefined,
      description: body.description !== undefined ? body.description : undefined,
      active: body.active,
    },
  });

  if (body.parentTypeIds) {
    await prisma.commercialTypeLink.deleteMany({ where: { childTypeId: id } });
    for (const parentTypeId of body.parentTypeIds) {
      await prisma.commercialTypeLink.create({ data: { parentTypeId, childTypeId: id } });
    }
    await prisma.commercialRecordType.update({
      where: { id },
      data: { isRoot: body.parentTypeIds.length === 0 },
    });
  }

  await recordAudit({
    action: "commercial_type.update",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "COMMERCIAL_TYPE",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const type = await prisma.commercialRecordType.findUnique({ where: { id } });
  if (!type) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (type.system) return NextResponse.json({ error: "system types cannot be deleted" }, { status: 409 });

  const inUse = await prisma.deal.count({ where: { commercialTypeId: id } });
  if (inUse > 0) {
    return NextResponse.json({ error: `${inUse} deal(s) use this type — deactivate instead` }, { status: 409 });
  }

  await prisma.commercialRecordType.update({ where: { id }, data: { active: false } });

  await recordAudit({
    action: "commercial_type.deactivate",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "COMMERCIAL_TYPE",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
