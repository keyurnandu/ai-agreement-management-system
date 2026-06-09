import httpx

from .base import AIProvider, Completion


class OllamaProvider(AIProvider):
    """Fully-local LLM via Ollama (https://ollama.com)."""

    name = "ollama"

    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model or "llama3.1"

    async def complete(self, prompt: str, system: str | None = None, max_tokens: int = 1024) -> Completion:
        payload: dict = {"model": self.model, "prompt": prompt, "stream": False}
        if system:
            payload["system"] = system
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{self.base_url}/api/generate", json=payload)
            resp.raise_for_status()
            data = resp.json()
        return Completion(text=data.get("response", ""), model=self.model, provider=self.name)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        async with httpx.AsyncClient(timeout=120) as client:
            for t in texts:
                resp = await client.post(f"{self.base_url}/api/embeddings", json={"model": self.model, "prompt": t})
                resp.raise_for_status()
                out.append(resp.json().get("embedding", []))
        return out

    async def healthy(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:  # noqa: BLE001
            return False
