"""Parse and normalize LLM extraction output by attribute type."""

import json
import re

SCALAR_MAX_CHARS = 300
STRUCTURED_MAX_CHARS = 100_000

_TABLE_HINTS = re.compile(
    r"\b(table|markdown|rows?|line\s*items?|all\s+products?|list\s+all|each\s+row|sku)\b",
    re.I,
)


def wants_structured_output(attribute: dict) -> bool:
    typ = (attribute.get("type") or "TEXT").upper()
    if typ in ("JSON", "MULTILINE", "TABLE"):
        return True
    prompt = str(attribute.get("prompt") or "")
    label = str(attribute.get("label") or "")
    return bool(_TABLE_HINTS.search(prompt) or _TABLE_HINTS.search(label))


def extract_max_tokens(attribute: dict) -> int:
    if wants_structured_output(attribute):
        return 4000
    return 120


def normalize_extract_value(attribute: dict, raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return "N/A"

    typ = (attribute.get("type") or "TEXT").upper()

    if typ == "JSON":
        start, end = text.find("{"), text.rfind("}")
        if start == -1:
            start, end = text.find("["), text.rfind("]")
        if start != -1 and end != -1:
            try:
                parsed = json.loads(text[start : end + 1])
                return json.dumps(parsed, ensure_ascii=False)[:STRUCTURED_MAX_CHARS]
            except json.JSONDecodeError:
                pass
        return text[:STRUCTURED_MAX_CHARS]

    if wants_structured_output(attribute):
        # Keep full multi-line tables/lists, not just the first line.
        lines = [ln.rstrip() for ln in text.splitlines()]
        # Drop leading/trailing blank lines but preserve table body.
        while lines and not lines[0].strip():
            lines.pop(0)
        while lines and not lines[-1].strip():
            lines.pop()
        joined = "\n".join(lines)
        return joined[:STRUCTURED_MAX_CHARS]

    # Scalar fields: single value, first non-empty line.
    for ln in text.splitlines():
        ln = ln.strip()
        if ln:
            return ln[:SCALAR_MAX_CHARS]
    return text[:SCALAR_MAX_CHARS]
