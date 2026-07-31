from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class Completion:
    text: str
    model: str
    provider: str


class AIProvider(ABC):
    """The seam that makes the LLM swappable: mock <-> ollama <-> anthropic <-> openai."""

    name: str = "base"

    @abstractmethod
    async def complete(self, prompt: str, system: str | None = None, max_tokens: int = 1024) -> Completion: ...

    @abstractmethod
    async def embed(self, texts: list[str]) -> list[list[float]]: ...

    @abstractmethod
    async def healthy(self) -> bool: ...

    async def analyze(self, text: str) -> dict:
        """Default LLM-based analysis returning structured JSON. Mock overrides with a heuristic."""
        import json

        system = (
            "You are a contract analyst. Return STRICT JSON only, with keys: "
            'summary (string), risks (array of {title, severity one of low|medium|high, note}), '
            "obligations (array of strings), key_dates (array of strings). No prose outside the JSON."
        )
        c = await self.complete(f"Analyze this contract.\n\nCONTRACT TEXT:\n{text[:8000]}", system, max_tokens=900)
        raw = (c.text or "").strip()
        start, end = raw.find("{"), raw.rfind("}")
        data: dict = {}
        if start != -1 and end != -1:
            try:
                data = json.loads(raw[start : end + 1])
            except Exception:  # noqa: BLE001
                data = {}
        return {
            "summary": data.get("summary") or (raw[:800] if not data else ""),
            "risks": data.get("risks", []),
            "obligations": data.get("obligations", []),
            "key_dates": data.get("key_dates", []),
            "provider": self.name,
        }

    async def extract(self, text: str, attributes: list[dict]) -> list[dict]:
        """LLM extraction with RAG-style chunk selection; attributes run concurrently."""
        import asyncio
        from ..core.embeddings import get_embedder
        from ..core.extract_ctx import prepare_document_chunks

        embedder = get_embedder()
        chunks = prepare_document_chunks(text)
        chunk_vectors = await embedder.embed(chunks) if chunks else None

        # Attributes are independent — extract them concurrently (bounded) so a
        # document with ~10 fields isn't 10x the latency of one.
        sem = asyncio.Semaphore(6)

        async def run(a: dict) -> dict:
            async with sem:
                return await self._extract_one(a, text, chunks, chunk_vectors, embedder)

        return list(await asyncio.gather(*(run(a) for a in attributes)))

    async def _extract_one(self, a: dict, text: str, chunks, chunk_vectors, embedder) -> dict:
        from ..core.extract_ctx import build_extraction_context
        from ..core.extract_parse import extract_max_tokens, normalize_extract_value, wants_structured_output
        from ..core.extract_mapreduce import should_map_reduce

        system = (
            "You are a contract data extractor. Extract the requested field from the contract text. "
            "Respond with ONLY the value, no explanation. If absent, respond 'N/A'."
        )
        if should_map_reduce(text, a):
            value = await self._extract_structured_mapreduce(a, text)
            return {"key": a.get("key"), "value": value, "confidence": None}

        mode = (a.get("mode") or "STRICT").upper()
        inc = a.get("inclusion") or []
        exc = a.get("exclusion") or []
        ctx = await build_extraction_context(text, a, chunks=chunks, chunk_vectors=chunk_vectors, embedder=embedder)

        if wants_structured_output(a):
            value = await self._extract_structured_json(a, ctx, mode, inc, exc, bool(chunks), len(text))
            return {"key": a.get("key"), "value": value, "confidence": None}

        parts = [
            f"Field: {a.get('label') or a.get('key')}",
            f"Type: {a.get('type', 'TEXT')}",
            "Mode: " + (
                "STRICT — return the value verbatim from the text"
                if mode == "STRICT"
                else "FLEXIBLE — infer/normalize even if not stated verbatim"
            ),
            f"Instruction: {a.get('prompt', '')}",
        ]
        if inc:
            parts.append("Examples of correct values: " + "; ".join(str(x) for x in inc))
        if exc:
            parts.append("Do NOT return values like: " + "; ".join(str(x) for x in exc))
        if chunks:
            from ..core.extract_ctx import TOP_K

            parts.append(
                f"(Note: showing up to {TOP_K} most relevant sections from a "
                f"{len(text):,}-character document.)"
            )
        parts.append("\nCONTRACT TEXT:\n" + ctx)
        max_out = extract_max_tokens(a)
        c = await self.complete("\n".join(parts), system, max_tokens=max_out)
        return {"key": a.get("key"), "value": normalize_extract_value(a, c.text or ""), "confidence": None}

    async def _extract_structured_json(
        self,
        attribute: dict,
        ctx: str,
        mode: str,
        inclusion: list,
        exclusion: list,
        chunked: bool,
        doc_len: int,
    ) -> str:
        """Extract line items as JSON then format — avoids incomplete markdown tables."""
        from ..core.extract_mapreduce import (
            TABLE_EXTRACT_SYSTEM,
            format_structured_result,
            parse_items_json,
        )
        from ..core.extract_ctx import TOP_K
        from ..core.extract_parse import normalize_extract_value

        parts = [
            f"Field: {attribute.get('label') or attribute.get('key')}",
            f"Type: {attribute.get('type', 'TEXT')}",
            "Mode: "
            + (
                "STRICT — return values verbatim from the text"
                if mode == "STRICT"
                else "FLEXIBLE — infer/normalize even if not stated verbatim"
            ),
            f"Instruction: {attribute.get('prompt', '')}",
        ]
        if inclusion:
            parts.append("Examples of correct values: " + "; ".join(str(x) for x in inclusion))
        if exclusion:
            parts.append("Do NOT return values like: " + "; ".join(str(x) for x in exclusion))
        if chunked:
            parts.append(f"(Note: showing up to {TOP_K} most relevant sections from a {doc_len:,}-character document.)")
        parts.append("\nTEXT:\n" + ctx)

        c = await self.complete("\n".join(parts), TABLE_EXTRACT_SYSTEM, max_tokens=4000)
        items = parse_items_json(c.text or "")
        if items:
            return format_structured_result(items, attribute, passes=1)
        return normalize_extract_value(attribute, c.text or "")

    async def _extract_structured_mapreduce(self, attribute: dict, text: str) -> str:
        """Process large documents chunk-by-chunk and merge line items."""
        from ..core.extract_mapreduce import (
            TABLE_EXTRACT_SYSTEM,
            CHUNK_OUTPUT_TOKENS,
            chunks_for_line_items,
            format_structured_result,
            merge_items,
            parse_items_json,
        )
        from ..core.extract_parse import STRUCTURED_MAX_CHARS, normalize_extract_value

        sections = chunks_for_line_items(text, attribute)
        all_rows: list[dict] = []
        for i, section in enumerate(sections, start=1):
            prompt = (
                f"Section {i} of {len(sections)}.\n"
                f"Field: {attribute.get('label') or attribute.get('key')}\n"
                f"Instruction: {attribute.get('prompt', '')}\n\n"
                f"TEXT:\n{section}"
            )
            c = await self.complete(prompt, TABLE_EXTRACT_SYSTEM, max_tokens=CHUNK_OUTPUT_TOKENS)
            all_rows.extend(parse_items_json(c.text or ""))

        merged = merge_items(all_rows)
        if not merged:
            return "N/A"
        formatted = format_structured_result(merged, attribute, passes=len(sections))
        return normalize_extract_value(attribute, formatted)

    @staticmethod
    def _json(raw: str, key: str, default):
        import json

        s, e = raw.find("{"), raw.rfind("}")
        if s != -1 and e != -1:
            try:
                return json.loads(raw[s : e + 1]).get(key, default)
            except Exception:  # noqa: BLE001
                pass
        return default

    async def classify(self, text: str) -> dict:
        system = (
            "You are a contract analyst. Split the contract into its clauses and classify each. "
            'Return STRICT JSON: {"clauses":[{"title","category","risk":"low|medium|high","text"}]}. No prose.'
        )
        c = await self.complete(f"Contract:\n{text[:8000]}", system, max_tokens=1200)
        return {"clauses": self._json(c.text or "", "clauses", []), "provider": self.name}

    async def redline(self, text: str, standards: list[dict]) -> dict:
        std = "\n".join(f"- {s.get('title')}: {s.get('text')}" for s in standards) or "(none provided)"
        system = (
            "You are a contract negotiator. Compare the contract against the company's standard clauses. "
            "For each standard, decide MATCH, DEVIATES, or MISSING, with a short note and a suggested edit. "
            'Return STRICT JSON: {"findings":[{"clause","status","note","suggestion"}]}.'
        )
        c = await self.complete(f"STANDARD CLAUSES:\n{std}\n\nCONTRACT:\n{text[:7000]}", system, max_tokens=1200)
        return {"findings": self._json(c.text or "", "findings", []), "provider": self.name}

    async def diff(self, before: str, after: str) -> dict:
        system = (
            "Summarize the substantive changes from BEFORE to AFTER in a contract as bullet points, "
            "focusing on legal/financial impact."
        )
        c = await self.complete(f"BEFORE:\n{before[:4000]}\n\nAFTER:\n{after[:4000]}", system, max_tokens=500)
        return {"summary": c.text, "provider": self.name}
