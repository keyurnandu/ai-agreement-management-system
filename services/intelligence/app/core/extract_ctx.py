"""Select the most relevant contract chunks for attribute extraction within token limits."""

import re

from .rag import chunk_text, cosine

# ~2k tokens — safe for chat models with prompt overhead
MAX_CONTEXT_CHARS = 8000
CHUNK_SIZE = 2500
CHUNK_OVERLAP = 300
MAX_CHUNKS = 120
TOP_K = 5
KEYWORD_PREFILTER = 24


def _attribute_terms(attribute: dict) -> list[str]:
    terms: list[str] = []
    for field in ("label", "key", "prompt"):
        val = str(attribute.get(field) or "")
        terms.extend(re.findall(r"[a-zA-Z]{3,}", val.lower()))
    for ex in attribute.get("inclusion") or []:
        terms.extend(re.findall(r"[a-zA-Z]{3,}", str(ex).lower()))
    # dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for t in terms:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def keyword_score(chunk: str, terms: list[str]) -> float:
    low = chunk.lower()
    return float(sum(low.count(t) for t in terms))


def prepare_document_chunks(text: str) -> list[str] | None:
    """Split large documents into chunks once per extract call."""
    if len(text) <= MAX_CONTEXT_CHARS:
        return None
    return chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP, max_chunks=MAX_CHUNKS)


async def build_extraction_context(
    text: str,
    attribute: dict,
    *,
    chunks: list[str] | None = None,
    chunk_vectors: list[list[float]] | None = None,
    embedder=None,
) -> str:
    """Return contract text (or the best-matching chunks) sized for the LLM context window."""
    if len(text) <= MAX_CONTEXT_CHARS:
        return text

    doc_chunks = chunks or chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP, max_chunks=MAX_CHUNKS)
    if not doc_chunks:
        return text[:MAX_CONTEXT_CHARS]

    terms = _attribute_terms(attribute)
    kw_scored = sorted(((keyword_score(c, terms), i) for i, c in enumerate(doc_chunks)), reverse=True)
    candidate_indices = [i for _, i in kw_scored[:KEYWORD_PREFILTER]]

    if embedder and chunk_vectors and len(chunk_vectors) == len(doc_chunks):
        query = " ".join(
            str(attribute.get(k) or "")
            for k in ("label", "key", "prompt")
        ).strip()
        qv = (await embedder.embed([query or attribute.get("key", "field")]))[0]
        sem_scored = sorted(
            ((cosine(qv, chunk_vectors[i]), i) for i in candidate_indices),
            reverse=True,
        )
        selected_indices = sorted(i for _, i in sem_scored[:TOP_K])
    else:
        selected_indices = sorted(candidate_indices[:TOP_K])

    parts = [doc_chunks[i] for i in selected_indices]
    ctx = "\n\n---\n\n".join(parts)
    return ctx[:MAX_CONTEXT_CHARS]
