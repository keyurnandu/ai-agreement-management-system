import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { canAccessDeal } from "@/lib/procurement";
import { env } from "@/env";
import { sendDealPortalInvite } from "@/lib/adapters/email";

export const dynamic = "force-dynamic";

const NEGOTIATION_STATUSES = ["DRAFT", "WITH_VENDOR", "VENDOR_SUBMITTED", "UNDER_REVIEW", "ISSUES_OPEN"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const existing = await prisma.deal.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (!NEGOTIATION_STATUSES.includes(existing.status)) {
    return NextResponse.json({ error: "cannot send portal invite after deal is approved or signing" }, { status: 400 });
  }

  const deal =
    existing.status === "DRAFT"
      ? await prisma.deal.update({
          where: { id },
          data: { status: "WITH_VENDOR", sentToVendorAt: new Date() },
        })
      : await prisma.deal.update({
          where: { id },
          data: { sentToVendorAt: new Date() },
        });

  const portalUrl = `${env.APP_BASE_URL.replace(/\/$/, "")}/vendor/${deal.vendorAccessToken}`;
  const org = await prisma.organizationSettings.findFirst();
  const orgName = org?.orgName ?? "Your organization";

  try {
    await sendDealPortalInvite({
      to: deal.vendorEmail,
      dealTitle: deal.title,
      orgName,
      portalUrl,
      message: deal.message,
    });
  } catch {
    /* email optional */
  }

  await recordAudit({
    action: existing.status === "DRAFT" ? "deal.send_vendor" : "deal.resend_vendor",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DEAL",
    resourceId: id,
    metadata: { vendorEmail: deal.vendorEmail, portalUrl, resend: existing.status !== "DRAFT" },
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ ok: true, portalUrl, resent: existing.status !== "DRAFT" });
}
