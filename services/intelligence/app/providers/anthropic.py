import httpx

from .base import AIProvider, Completion

DEFAULT_MODEL = "claude-sonnet-4-6"


class AnthropicProvider(AIProvider):
    """Claude via the Anthropic Messages API."""

    name = "anthropic"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model or DEFAULT_MODEL

    async def complete(self, prompt: str, system: str | None = None, max_tokens: int = 1024) -> Completion:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        body: dict = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            body["system"] = system
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        return Completion(text=text, model=self.model, provider=self.name)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError(
            "Anthropic has no embeddings API. Set EMBEDDING_PROVIDER=openai or =local for RAG embeddings."
        )

    async def healthy(self) -> bool:
        return bool(self.api_key)
