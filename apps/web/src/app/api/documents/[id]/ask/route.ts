import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { canAccessDocument } from "@/lib/documents";
import { answerAboutDocument, answerAcrossCollection } from "@/lib/document-qa";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = { id: session.user.id, role: session.user.role };

  const { id } = await ctx.params;
  if (!(await canAccessDocument(actor, id, "VIEW"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { question?: string; history?: { role: string; content: string }[] };
  if (!body.question?.trim()) return NextResponse.json({ error: "question required" }, { status: 400 });
  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  await recordAudit({
    action: "document.ask",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { question: body.question.slice(0, 120) },
  });

  const doc = await prisma.document.findUnique({ where: { id }, select: { kind: true } });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result =
    doc.kind === "COLLECTION"
      ? await answerAcrossCollection(id, body.question, history)
      : await answerAboutDocument(id, body.question, history);
  return NextResponse.json(result);
}
