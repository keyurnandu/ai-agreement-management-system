import json
from pathlib import Path

from .config import get_settings


def _path(doc_id: str) -> Path:
    base = get_settings().resolved_vector_path()
    base.mkdir(parents=True, exist_ok=True)
    safe = "".join(ch for ch in doc_id if ch.isalnum() or ch in "-_") or "doc"
    return base / f"{safe}.json"


def save(doc_id: str, chunks: list[str], vectors: list[list[float]]) -> None:
    _path(doc_id).write_text(json.dumps({"chunks": chunks, "vectors": vectors}), encoding="utf-8")


def load(doc_id: str) -> dict | None:
    p = _path(doc_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return None
