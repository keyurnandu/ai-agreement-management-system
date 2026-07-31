/**
 * Phase 2 chat routing: answer factual questions directly from extracted
 * attributes instead of the LLM. High precision by design — only distinctive,
 * multi-word phrases route to a fact; anything ambiguous ("liability exposure")
 * falls through to RAG.
 */

export interface AttrFact {
  key: string;
  label: string;
  value: string;
}

// Distinctive phrases per attribute key. Longer phrase match = stronger signal.
const KEYWORDS: Record<string, string[]> = {
  order_total: ["order total", "total value", "contract value", "total amount", "how much", "total fee", "order value", "deal value"],
  effective_date: ["effective date", "start date", "commencement date", "when does it start", "when does it begin", "when did it start"],
  term_end_date: ["end date", "expiry date", "expiration date", "when does it expire", "when does it end", "termination date", "when will it expire"],
  term_months: ["term length", "how long is the term", "contract term", "term duration", "how many months", "length of the term"],
  subscription_term: ["subscription term", "subscription length", "subscription period"],
  governing_law: ["governing law", "which law", "governing jurisdiction", "law governs", "what law applies", "which jurisdiction"],
  parties: ["who are the parties", "counterparty name", "who is this between", "which parties", "who is the counterparty", "parties to this"],
  renewal_notice_days: ["renewal notice", "notice period", "non-renewal notice", "how much notice"],
  auto_renewal: ["auto-renew", "automatically renew", "does it auto renew", "automatic renewal", "auto renewal", "is it evergreen"],
  liability_cap: ["liability cap", "cap on liability", "liability limit", "how is liability capped", "limited to"],
};

/** Pick the attribute whose distinctive phrase best matches the question. */
export function routeToAttribute(question: string, facts: AttrFact[]): AttrFact | null {
  const q = question.toLowerCase();
  let best: AttrFact | null = null;
  let bestScore = 0;
  for (const f of facts) {
    if (!f.value || f.value.trim() === "" || f.value === "N/A") continue;
    const kws = KEYWORDS[f.key];
    if (!kws) continue;
    let score = 0;
    for (const kw of kws) {
      if (q.includes(kw)) score = Math.max(score, kw.split(" ").length);
    }
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return bestScore > 0 ? best : null;
}

/** Natural-language phrasing for a fact answer. */
export function factAnswer(hit: AttrFact): string {
  return `The ${hit.label.trim().toLowerCase()} is ${hit.value.trim()}.\n\n(Answered from the extracted contract data — click the source to see it on the document.)`;
}
