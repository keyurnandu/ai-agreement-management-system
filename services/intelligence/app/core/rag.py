import math


def chunk_text(text: str, size: int = 600, overlap: int = 100, max_chunks: int = 60) -> list[str]:
    """Split text into overlapping character windows for embedding."""
    text = (text or "").strip()
    if not text:
        return []
    chunks: list[str] = []
    step = max(1, size - overlap)
    i = 0
    while i < len(text) and len(chunks) < max_chunks:
        chunks.append(text[i : i + size])
        i += step
    return chunks


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    n = min(len(a), len(b))
    dot = sum(a[i] * b[i] for i in range(n))
    na = math.sqrt(sum(x * x for x in a[:n])) or 1.0
    nb = math.sqrt(sum(x * x for x in b[:n])) or 1.0
    return dot / (na * nb)
