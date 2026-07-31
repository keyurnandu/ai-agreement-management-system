import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { canAccessDeal } from "@/lib/procurement";
import { autoPlaceSignatureFields } from "@/lib/auto-signature-fields";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (deal.status !== "APPROVED" && deal.status !== "SIGNING") {
    return NextResponse.json({ error: "deal must be approved first" }, { status: 400 });
  }

  const owner = await prisma.user.findUnique({
    where: { id: deal.ownerId },
    select: { id: true, email: true, name: true },
  });

  let agreementId = deal.agreementId;
  if (!agreementId) {
    const existing = await prisma.agreement.findUnique({ where: { documentId: deal.documentId } });
    if (existing) {
      agreementId = existing.id;
    } else {
      const ag = await prisma.agreement.create({
        data: {
          documentId: deal.documentId,
          title: deal.title,
          ownerId: session.user.id,
          message: deal.message,
          status: "DRAFT",
        },
      });
      agreementId = ag.id;
      await prisma.recipient.create({
        data: {
          agreementId: ag.id,
          email: deal.vendorEmail,
          name: deal.vendorName,
          role: "SIGNER",
          routingOrder: 1,
        },
      });
      if (owner?.email && owner.email !== deal.vendorEmail) {
        await prisma.recipient.create({
          data: {
            agreementId: ag.id,
            email: owner.email,
            name: owner.name,
            role: "SIGNER",
            routingOrder: 2,
          },
        });
      }
    }
  }
  // Always advance to SIGNING (even when re-entering with an existing agreement),
  // otherwise the deal can't auto-complete when its agreement finishes signing.
  await prisma.deal.update({ where: { id }, data: { agreementId, status: "SIGNING" } });

  // Ensure both parties exist on existing agreements started before this change.
  if (agreementId && owner?.email) {
    const recips = await prisma.recipient.findMany({ where: { agreementId } });
    const emails = new Set(recips.map((r) => r.email.toLowerCase()));
    if (!emails.has(deal.vendorEmail.toLowerCase())) {
      await prisma.recipient.create({
        data: {
          agreementId,
          email: deal.vendorEmail,
          name: deal.vendorName,
          role: "SIGNER",
          routingOrder: recips.length + 1,
        },
      });
    }
    if (!emails.has(owner.email.toLowerCase()) && owner.email !== deal.vendorEmail) {
      await prisma.recipient.create({
        data: {
          agreementId,
          email: owner.email,
          name: owner.name,
          role: "SIGNER",
          routingOrder: recips.length + 2,
        },
      });
    }
  }

  try {
    await autoPlaceSignatureFields(agreementId!, session.user.id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "signature setup failed" }, { status: 500 });
  }

  await recordAudit({
    action: "deal.start_signing",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DEAL",
    resourceId: id,
    metadata: { agreementId },
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ agreementId });
}
