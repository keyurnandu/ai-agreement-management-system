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
        """Default LLM-based extraction: one focused prompt per attribute via complete().
        Providers with no real LLM (mock) override this with a heuristic."""
        system = (
            "You are a contract data extractor. Extract the requested field from the contract text. "
            "Respond with ONLY the value, no explanation. If absent, respond 'N/A'."
        )
        results: list[dict] = []
        for a in attributes:
            mode = (a.get("mode") or "STRICT").upper()
            inc = a.get("inclusion") or []
            exc = a.get("exclusion") or []
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
            parts.append("\nCONTRACT TEXT:\n" + text[:6000])
            c = await self.complete("\n".join(parts), system, max_tokens=120)
            lines = [ln for ln in (c.text or "").strip().splitlines() if ln.strip()]
            results.append({"key": a.get("key"), "value": (lines[0][:300] if lines else "N/A"), "confidence": None})
        return results

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
