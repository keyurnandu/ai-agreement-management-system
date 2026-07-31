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

/** Two-stage retrieval across every document in a collection. */
async function answerAcrossCollection(collectionId: string, question: string) {
  // Gather descendant FILE documents (BFS through nested collections).
  const files: { id: string; title: string }[] = [];
  let frontier = [collectionId];
  const seen = new Set<string>();
  while (frontier.length && files.length < 12) {
    const kids = await prisma.document.findMany({
      where: { collectionParentId: { in: frontier } },
      select: { id: true, title: true, kind: true },
    });
    frontier = [];
    for (const k of kids) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      if (k.kind === "COLLECTION") frontier.push(k.id);
      else files.push({ id: k.id, title: k.title });
    }
  }
  if (!files.length) {
    return { answer: "This collection has no documents to search yet.", citations: [], provider: "collection", routed: "collection" };
  }

  // Fact routing across the collection — if the question maps to an extracted
  // attribute, answer from each document's value (no LLM, exact, per-doc cites).
  const perDocFacts = await Promise.all(files.map(async (f) => ({ f, facts: await loadFacts(f.id) })));
  const unionFacts: AttrFact[] = [];
  const keySeen = new Set<string>();
  for (const { facts } of perDocFacts) {
    for (const fact of facts) {
      if (!keySeen.has(fact.key)) {
        keySeen.add(fact.key);
        unionFacts.push(fact);
      }
    }
  }
  const factHit = routeToAttribute(question, unionFacts);
  if (factHit) {
    const rows = perDocFacts
      .map(({ f, facts }) => {
        const v = facts.find((x) => x.key === factHit.key);
        return v?.value ? { docId: f.id, docTitle: f.title, value: v.value } : null;
      })
      .filter((r): r is { docId: string; docTitle: string; value: string } => r !== null);
    if (rows.length) {
      const lines = rows.map((r) => `• ${r.docTitle}: ${r.value}`).join("\n");
      const answer = `The ${factHit.label.toLowerCase()} across ${rows.length} document${rows.length === 1 ? "" : "s"} in this collection:\n\n${lines}\n\n(Answered from the extracted contract data.)`;
      const citations = rows.slice(0, 6).map((r, i) => ({ n: i + 1, score: 1, text: r.value, docId: r.docId, docTitle: r.docTitle }));
      return { answer, citations, provider: "extracted data", routed: "collection-facts", searched: files.length };
    }
  }

  // Load text for each file.
  const withText: { id: string; title: string; text: string }[] = [];
  for (const f of files) {
    const t = await getDocumentText(f.id);
    if (t) withText.push({ ...f, text: t });
  }
  if (!withText.length) {
    return { answer: "The documents in this collection don't have extractable text yet.", citations: [], provider: "collection", routed: "collection" };
  }

  // Stage 1 — rank documents by keyword overlap; keep the most relevant few.
  const terms = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const ranked = withText
    .map((d) => {
      const lt = d.text.toLowerCase();
      const score = terms.reduce((s, t) => s + (lt.includes(t) ? 1 : 0), 0);
      return { ...d, score };
    })
    .sort((a, b) => b.score - a.score);
  const top = (ranked.some((d) => d.score > 0) ? ranked.filter((d) => d.score > 0) : ranked).slice(0, 3);

  // Stage 2 — RAG within each top document, then pick the best-supported answer.
  const perDoc = [];
  for (const d of top) {
    const res = await intelligence.ask(d.text, question, d.id);
    perDoc.push({ doc: d, res, topScore: res.citations?.[0]?.score ?? 0 });
  }
  perDoc.sort((a, b) => b.topScore - a.topScore);
  const best = perDoc[0];
  const citations = perDoc.slice(0, 3).map((p, i) => ({
    n: i + 1,
    score: p.topScore,
    text: p.res.citations?.[0]?.text ?? p.doc.title,
    docId: p.doc.id,
    docTitle: p.doc.title,
  }));
  const answer = `${best.res.answer}\n\n(Best match: ${best.doc.title}. Searched ${withText.length} document${withText.length === 1 ? "" : "s"} in this collection.)`;
  return { answer, citations, provider: best.res.provider, routed: "collection", searched: withText.length };
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

  // Collection scope — two-stage retrieval across the collection's documents.
  const doc = await prisma.document.findUnique({ where: { id }, select: { kind: true } });
  if (doc?.kind === "COLLECTION") {
    return NextResponse.json(await answerAcrossCollection(id, body.question));
  }

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
