import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { roleAtLeast } from "@/lib/rbac";
import { getOrgSettings } from "@/lib/org-branding";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const org = await getOrgSettings();
  return NextResponse.json({ org });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!roleAtLeast(session.user.role, "MANAGER")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { orgName?: string; headerText?: string; footerText?: string };
  const org = await prisma.organizationSettings.update({
    where: { id: "default" },
    data: {
      orgName: body.orgName?.trim() || undefined,
      headerText: body.headerText ?? undefined,
      footerText: body.footerText ?? undefined,
    },
  });
  return NextResponse.json({ org });
}
