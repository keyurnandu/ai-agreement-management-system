import { prisma } from "@/lib/db";
import { intelligence } from "@/lib/services/client";
import { getDocumentText } from "@/lib/documents";
import { routeToAttribute, factAnswer, type AttrFact } from "@/lib/chat-intent";

export interface QaCitation {
  n: number;
  score: number;
  text: string;
  docId?: string;
  docTitle?: string;
}
export interface QaResult {
  answer: string;
  citations: QaCitation[];
  provider: string;
  routed: string;
  searched?: number;
}

/** The document's best (MANUAL over AI) extracted value per attribute. */
export async function loadFacts(documentId: string): Promise<AttrFact[]> {
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

/** Answer a question about a single document: extracted facts first, then RAG. */
export async function answerAboutDocument(documentId: string, question: string): Promise<QaResult> {
  const facts = await loadFacts(documentId);
  const hit = routeToAttribute(question, facts);
  if (hit) {
    return { answer: factAnswer(hit), citations: [{ n: 1, score: 1, text: hit.value }], provider: "extracted data", routed: "attributes" };
  }
  const text = await getDocumentText(documentId);
  if (text === null) return { answer: "This document has no extractable text yet.", citations: [], provider: "none", routed: "rag" };
  const result = await intelligence.ask(text, question, documentId);
  return { ...result, routed: "rag" };
}

/** Two-stage retrieval across every document in a collection. */
export async function answerAcrossCollection(collectionId: string, question: string): Promise<QaResult> {
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
  if (!files.length) return { answer: "This collection has no documents to search yet.", citations: [], provider: "collection", routed: "collection" };

  // Fact routing across the collection — aggregate each doc's extracted value.
  const perDocFacts = await Promise.all(files.map(async (f) => ({ f, facts: await loadFacts(f.id) })));
  const unionFacts: AttrFact[] = [];
  const keySeen = new Set<string>();
  for (const { facts } of perDocFacts) for (const fact of facts) if (!keySeen.has(fact.key)) { keySeen.add(fact.key); unionFacts.push(fact); }
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

  // Two-stage RAG.
  const withText: { id: string; title: string; text: string }[] = [];
  for (const f of files) {
    const t = await getDocumentText(f.id);
    if (t) withText.push({ ...f, text: t });
  }
  if (!withText.length) return { answer: "The documents in this collection don't have extractable text yet.", citations: [], provider: "collection", routed: "collection" };

  const terms = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const ranked = withText
    .map((d) => ({ ...d, score: terms.reduce((s, t) => s + (d.text.toLowerCase().includes(t) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);
  const top = (ranked.some((d) => d.score > 0) ? ranked.filter((d) => d.score > 0) : ranked).slice(0, 3);

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
