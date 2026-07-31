import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { intelligence } from "@/lib/services/client";
import { canAccessDocument, getDocumentText } from "@/lib/documents";
import { routeToAttribute, factAnswer, type AttrFact } from "@/lib/chat-intent";

export const dynamic = "force-dynamic";

/** Load the document's best (MANUAL over AI) extracted value per attribute. */
async function loadFacts(documentId: string): Promise<AttrFact[]> {
  const values = await prisma.attributeValue.findMany({
    where: { documentId, value: { not: null } },
    select: { value: true, method: true, definition: { select: { key: true, label: true } } },
  });
  const byKey = new Map<string, { fact: AttrFact; method: string }>();
  for (const v of values) {
    if (!v.value || !v.definition) continue;
    const cur = byKey.get(v.definition.key);
    if (!cur || (v.method === "MANUAL" && cur.method !== "MANUAL")) {
      byKey.set(v.definition.key, { fact: { key: v.definition.key, label: v.definition.label, value: v.value }, method: v.method });
    }
  }
  return [...byKey.values()].map((x) => x.fact);
}

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

  await recordAudit({
    action: "document.ask",
    actorId: actor.id,
    actorEmail: session.user.email,
    resourceType: "DOCUMENT",
    resourceId: id,
    metadata: { question: body.question.slice(0, 120) },
  });

  // Layer 0 — intent routing: answer factual questions from extracted data (no LLM).
  const facts = await loadFacts(id);
  const hit = routeToAttribute(body.question, facts);
  if (hit) {
    return NextResponse.json({
      answer: factAnswer(hit),
      citations: [{ n: 1, score: 1, text: hit.value }],
      provider: "extracted data",
      routed: "attributes",
    });
  }

  // Layer 1 — semantic: RAG over the document.
  const text = await getDocumentText(id);
  if (text === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await intelligence.ask(text, body.question, id);
  return NextResponse.json({ ...result, routed: "rag" });
}
