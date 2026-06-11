"""Map-reduce extraction for large product/service lists that exceed a single LLM context."""

import json
import re

from .extract_ctx import (
    CHUNK_OVERLAP,
    CHUNK_SIZE,
    MAX_CHUNKS,
    MAX_CONTEXT_CHARS,
    _attribute_terms,
    keyword_score,
)
from .rag import chunk_text

LINE_ITEM_HINT = re.compile(
    r"\b(sku|product|quantity|unit\s*price|total\s*price|\$\s*[\d,]+|year\s*\d|line\s*item|grand\s*total)\b",
    re.I,
)
MAX_MAP_PASSES = 50
CHUNK_OUTPUT_TOKENS = 1500

TABLE_EXTRACT_SYSTEM = (
    "You extract product and service line items from contract text. "
    'Return STRICT JSON only: {"items":[{"sku":"","product_name":"","description":"",'
    '"quantity":"","unit_price":"","year":"","total_price":""}]}. '
    "Include EVERY line item in the section. If none, return {\"items\":[]}."
)


def should_map_reduce(text: str, attribute: dict) -> bool:
    from .extract_parse import wants_structured_output

    return wants_structured_output(attribute) and len(text) > MAX_CONTEXT_CHARS


def chunks_for_line_items(text: str, attribute: dict) -> list[str]:
    """Pick document sections likely to contain tabular line items."""
    if len(text) <= MAX_CONTEXT_CHARS:
        return [text]

    doc_chunks = chunk_text(text, size=CHUNK_SIZE, overlap=CHUNK_OVERLAP, max_chunks=MAX_CHUNKS)
    terms = _attribute_terms(attribute)
    scored: list[tuple[float, int, str]] = []
    for i, c in enumerate(doc_chunks):
        score = keyword_score(c, terms)
        if LINE_ITEM_HINT.search(c):
            score += 5.0
        scored.append((score, i, c))

    scored.sort(key=lambda x: (-x[0], x[1]))
    picked = [c for s, _, c in scored if s > 0][:MAX_MAP_PASSES]
    if not picked:
        picked = [c for _, _, c in scored[:MAX_MAP_PASSES]]
    return picked


def parse_items_json(raw: str) -> list[dict]:
    text = (raw or "").strip()
    if not text:
        return []
    start, end = text.find("{"), text.rfind("}")
    if start == -1:
        start, end = text.find("["), text.rfind("]")
    if start == -1 or end == -1:
        return []
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        items = data.get("items")
        if isinstance(items, list):
            return [x for x in items if isinstance(x, dict)]
    return []


def merge_items(rows: list[dict]) -> list[dict]:
    """Dedupe rows — prefer first occurrence by SKU, else by normalized row body."""
    seen: set[str] = set()
    out: list[dict] = []
    for row in rows:
        sku = str(row.get("sku") or row.get("SKU") or "").strip().upper()
        key = sku if sku else json.dumps(row, sort_keys=True, ensure_ascii=False)
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def items_to_markdown(items: list[dict]) -> str:
    if not items:
        return "N/A"
    preferred = ["sku", "product_name", "description", "quantity", "unit_price", "year", "total_price"]
    keys: list[str] = []
    for k in preferred:
        if any(k in row or k.replace("_", " ") in str(row.keys()) for row in items):
            keys.append(k)
    if not keys:
        keys = list(items[0].keys())

    def cell(row: dict, k: str) -> str:
        v = row.get(k, row.get(k.replace("_", " "), ""))
        return str(v or "").replace("|", "\\|").replace("\n", " ")

    header = "| " + " | ".join(k.replace("_", " ").title() for k in keys) + " |"
    sep = "| " + " | ".join("---" for _ in keys) + " |"
    body = ["| " + " | ".join(cell(r, k) for k in keys) + " |" for r in items]
    return "\n".join([header, sep, *body])


def format_structured_result(items: list[dict], attribute: dict, *, passes: int) -> str:
    typ = (attribute.get("type") or "TEXT").upper()
    payload = {"items": items, "_meta": {"passes": passes, "row_count": len(items)}}
    if typ == "JSON":
        return json.dumps(payload, ensure_ascii=False)
    table = items_to_markdown(items)
    footer = f"\n\n_({len(items)} line item{'s' if len(items) != 1 else ''}"
    if passes > 1:
        footer += f" from {passes} document sections"
    footer += ")_"
    return table + footer
