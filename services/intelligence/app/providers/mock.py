import hashlib
import re

from .base import AIProvider, Completion

EMBED_DIM = 64


class MockProvider(AIProvider):
    """Deterministic, zero-dependency provider so the platform runs with no API keys."""

    name = "mock"

    def __init__(self, model: str = "") -> None:
        self.model = model or "mock-1"

    async def complete(self, prompt: str, system: str | None = None, max_tokens: int = 1024) -> Completion:
        words = prompt.split()
        preview = " ".join(words[:40])
        text = (
            "[mock AI] Deterministic stub so the platform runs with zero API keys.\n\n"
            f"- system prompt: {'set' if system else 'none'}\n"
            f"- prompt size: {len(prompt)} chars / {len(words)} words\n"
            f"- preview: {preview}\n\n"
            "Set AI_PROVIDER=ollama|anthropic|openai (and the matching key/URL) in .env for real output."
        )
        return Completion(text=text, model=self.model, provider=self.name)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_one(t) for t in texts]

    def _embed_one(self, text: str) -> list[float]:
        vec = [0.0] * EMBED_DIM
        for tok in text.lower().split():
            bucket = int(hashlib.md5(tok.encode()).hexdigest(), 16) % EMBED_DIM
            vec[bucket] += 1.0
        norm = sum(v * v for v in vec) ** 0.5 or 1.0
        return [v / norm for v in vec]

    async def healthy(self) -> bool:
        return True

    async def analyze(self, text: str) -> dict:
        t = text or ""
        sentences = [s.strip() for s in re.split(r"(?<=[.])\s+", t) if s.strip()]
        summary = " ".join(sentences[:3])[:500] or "(no extractable text)"
        risks: list[dict] = []
        checks = [
            (r"indemnif", "high", "Indemnification clause present — review scope and caps."),
            (r"unlimited|uncapped", "high", "Possible unlimited/uncapped liability language."),
            (r"auto-?renew|automatically renew", "medium", "Auto-renewal — watch the notice window."),
            (r"exclusiv", "medium", "Exclusivity obligation present."),
            (r"terminat", "low", "Termination provisions present — verify notice period."),
        ]
        for pat, sev, note in checks:
            if re.search(pat, t, re.I):
                risks.append({"title": pat.split("|")[0].replace("\\", ""), "severity": sev, "note": note})
        if not re.search(r"govern", t, re.I):
            risks.append({"title": "no governing law", "severity": "medium", "note": "No governing-law clause detected."})
        obligations = [s[:160] for s in sentences if re.search(r"\bshall\b", s, re.I)][:6]
        key_dates = re.findall(r"\b\d{4}-\d{2}-\d{2}\b", t)[:5] + re.findall(r"\b\d+\s*months?\b", t, re.I)[:5]
        return {"summary": summary, "risks": risks, "obligations": obligations, "key_dates": key_dates, "provider": self.name}

    async def extract(self, text: str, attributes: list[dict]) -> list[dict]:
        # Key-free heuristic extraction so the pipeline is demonstrable without an LLM.
        out: list[dict] = []
        for a in attributes:
            value = self._heuristic(a, text or "")
            out.append({"key": a.get("key"), "value": value, "confidence": 0.45 if value != "N/A" else 0.0})
        return out

    def _heuristic(self, a: dict, text: str) -> str:
        typ = (a.get("type") or "TEXT").upper()
        key = (a.get("key") or "").lower()
        label = (a.get("label") or "").lower()
        if typ == "DATE":
            m = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text) or re.search(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b", text)
            return m.group(1) if m else "N/A"
        if typ == "NUMBER":
            m = re.search(r"(\d+)\s*month", text, re.I) or re.search(r"\$?\s*([\d][\d,]{1,})", text)
            return m.group(1).replace(",", "") if m else "N/A"
        if typ == "BOOLEAN":
            has = re.search(r"renew", text, re.I) is not None
            neg = re.search(r"(no|not|without)\s+(?:\w+\s+){0,3}renew", text, re.I) is not None
            return "true" if (has and not neg) else "false"
        if "law" in key or "law" in label or "govern" in key:
            m = re.search(r"laws of ([A-Z][\w .,'\-]{2,40})", text)
            return m.group(1).strip(" .") if m else "N/A"
        return "N/A"

    @staticmethod
    def _classify_block(b: str) -> tuple[str, str]:
        low = b.lower()
        if "indemnif" in low:
            return ("Indemnification", "high")
        if "unlimited" in low or "uncapped" in low:
            return ("Liability", "high")
        if "terminat" in low:
            return ("Termination", "medium")
        if "confidential" in low:
            return ("Confidentiality", "low")
        if "govern" in low:
            return ("Governing law", "low")
        if "payment" in low or "fee" in low:
            return ("Payment", "medium")
        if "renew" in low:
            return ("Renewal", "medium")
        return ("General", "low")

    async def classify(self, text: str) -> dict:
        blocks = [b.strip() for b in re.split(r"\n\s*\n", text or "") if b.strip()]
        clauses = []
        for b in blocks[:30]:
            cat, risk = self._classify_block(b)
            first = b.split(".")[0].strip()
            title = (first[:48] if first else cat)
            clauses.append({"title": title, "category": cat, "risk": risk, "text": b[:200]})
        return {"clauses": clauses, "provider": self.name}

    async def redline(self, text: str, standards: list[dict]) -> dict:
        low = (text or "").lower()
        findings = []
        for s in standards:
            title = s.get("title", "") or ""
            stext = s.get("text", "") or ""
            kw = next((w for w in title.lower().split() if len(w) > 3), title.lower())
            if kw and kw in low:
                findings.append({"clause": title, "status": "PRESENT", "note": "Related clause found; review wording vs standard.", "suggestion": ""})
            else:
                findings.append({"clause": title, "status": "MISSING", "note": "No matching clause detected.", "suggestion": f"Add standard language: {stext[:140]}"})
        return {"findings": findings, "provider": self.name}

    async def diff(self, before: str, after: str) -> dict:
        delta = len(after) - len(before)
        return {
            "summary": f"[mock] Length change {delta:+d} chars ({len(before)} -> {len(after)}). Set AI_PROVIDER for a real change summary.",
            "provider": self.name,
        }
