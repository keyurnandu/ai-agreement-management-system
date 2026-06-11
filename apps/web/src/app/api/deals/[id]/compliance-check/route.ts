import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit, auditRequestMeta } from "@/lib/audit";
import { canAccessDeal, runComplianceCheck } from "@/lib/procurement";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!(await canAccessDeal({ id: session.user.id, role: session.user.role }, id))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const issues = await runComplianceCheck(id, session.user.id);
    await recordAudit({
      action: "deal.compliance_check",
      actorId: session.user.id,
      actorEmail: session.user.email,
      resourceType: "DEAL",
      resourceId: id,
      metadata: { issueCount: issues.length },
      ...auditRequestMeta(req),
    });
    return NextResponse.json({
      issues: issues.length,
      findings: issues.map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        description: i.description,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "check failed" }, { status: 400 });
  }
}
