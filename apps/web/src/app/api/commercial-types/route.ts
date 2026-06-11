import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { roleAtLeast } from "@/lib/rbac";
import { listCommercialTypes } from "@/lib/commercial-types";
import type { CommercialDomain } from "@/lib/commercial-types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const domain = new URL(req.url).searchParams.get("domain") as CommercialDomain | null;
  const types = await listCommercialTypes(!roleAtLeast(session.user.role, "MANAGER"), domain ?? undefined);
  return NextResponse.json({ types });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    key?: string;
    name?: string;
    prefix?: string;
    direction?: string;
    domain?: string;
    isRoot?: boolean;
    description?: string;
    parentTypeIds?: string[];
  };

  const key = String(body.key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_");
  const name = String(body.name ?? "").trim();
  const prefix = String(body.prefix ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const direction = body.direction === "ORG_BUYING" ? "ORG_BUYING" : "ORG_SELLING";
  const domain = (["DEAL", "CONTRACT", "DOCUMENT"].includes(body.domain ?? "")
    ? body.domain
    : "DEAL") as CommercialDomain;

  if (!key || !name || !prefix) {
    return NextResponse.json({ error: "key, name, and prefix required" }, { status: 400 });
  }
  if (prefix.length < 2 || prefix.length > 8) {
    return NextResponse.json({ error: "prefix must be 2–8 characters" }, { status: 400 });
  }

  const existing = await prisma.commercialRecordType.findFirst({
    where: { OR: [{ key }, { prefix }] },
  });
  if (existing) return NextResponse.json({ error: "key or prefix already exists" }, { status: 409 });

  const isRoot = body.isRoot !== false && !(body.parentTypeIds?.length ?? 0);
  const parentTypeIds = body.parentTypeIds ?? [];

  const type = await prisma.commercialRecordType.create({
    data: {
      key,
      name,
      prefix,
      direction,
      domain,
      isRoot,
      description: body.description?.trim() || null,
      system: false,
      sortOrder: 100,
    },
  });

  await prisma.commercialIdSequence.upsert({
    where: { prefix },
    create: { prefix, nextVal: 1 },
    update: {},
  });

  for (const parentTypeId of parentTypeIds) {
    await prisma.commercialTypeLink.create({
      data: { parentTypeId, childTypeId: type.id },
    });
  }

  await recordAudit({
    action: "commercial_type.create",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "COMMERCIAL_TYPE",
    resourceId: type.id,
    metadata: { prefix, key },
  });

  return NextResponse.json({ id: type.id });
}
