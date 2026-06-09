import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { intelligence } from "@/lib/services/client";
import { canAccessDocument, getDocumentText } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "VIEW"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { question?: string };
  if (!body.question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 });

  const text = await getDocumentText(id);
  if (text === null) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await intelligence.ask(text, body.question);
  await recordAudit({
    action: "document.ask",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { question: body.question.slice(0, 120) },
  });
  return NextResponse.json(result);
}
