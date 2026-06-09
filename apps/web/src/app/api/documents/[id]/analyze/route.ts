import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { intelligence } from "@/lib/services/client";
import { canAccessDocument, getDocumentText } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "VIEW"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const text = await getDocumentText(id);
  if (text === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await intelligence.analyze(text);
  await recordAudit({
    action: "document.analyze",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { provider: result.provider, risks: result.risks.length },
  });
  return NextResponse.json(result);
}
