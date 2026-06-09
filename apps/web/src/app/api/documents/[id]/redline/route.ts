import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { intelligence } from "@/lib/services/client";
import { canAccessDocument, getDocumentText } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "VIEW"))) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const text = await getDocumentText(id);
  if (text === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Standards = the approved clause-library texts to negotiate against.
  const standards = (
    await prisma.clauseLibraryEntry.findMany({ where: { active: true }, select: { title: true, body: true } })
  ).map((c) => ({ title: c.title, text: c.body }));

  const result = await intelligence.redline(text, standards);
  await recordAudit({
    action: "document.redline",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { findings: result.findings.length },
  });
  return NextResponse.json(result);
}
