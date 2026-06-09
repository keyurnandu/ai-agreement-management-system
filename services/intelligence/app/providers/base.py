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
            prompt = (
                f"Field: {a.get('label') or a.get('key')}\n"
                f"Type: {a.get('type', 'TEXT')}\n"
                f"Instruction: {a.get('prompt', '')}\n\nCONTRACT TEXT:\n{text[:6000]}"
            )
            c = await self.complete(prompt, system, max_tokens=120)
            lines = [ln for ln in (c.text or "").strip().splitlines() if ln.strip()]
            results.append({"key": a.get("key"), "value": (lines[0][:300] if lines else "N/A"), "confidence": None})
        return results
