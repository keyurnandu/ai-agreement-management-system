import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { canAccessDeal } from "@/lib/procurement";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { title?: string; description?: string; severity?: string; page?: number };
  if (!body.title?.trim() || !body.description?.trim()) {
    return NextResponse.json({ error: "title and description required" }, { status: 400 });
  }

  const issue = await prisma.reviewIssue.create({
    data: {
      dealId: id,
      title: body.title.trim(),
      description: body.description.trim(),
      severity: body.severity ?? "MEDIUM",
      page: body.page ?? null,
      raisedBySide: "ORG",
      raisedById: session.user.id,
    },
  });

  await prisma.deal.update({ where: { id }, data: { status: "ISSUES_OPEN" } });
  await recordAudit({
    action: "deal.issue.create",
    actorId: session.user.id,
    actorEmail: session.user.email,
    resourceType: "DEAL",
    resourceId: id,
    metadata: { issueId: issue.id, title: issue.title },
    ...auditRequestMeta(req),
  });

  return NextResponse.json({ issue });
}
