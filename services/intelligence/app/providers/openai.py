import httpx

from .base import AIProvider, Completion

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_EMBED_MODEL = "text-embedding-3-small"


class OpenAIProvider(AIProvider):
    """OpenAI via the Chat Completions + Embeddings APIs."""

    name = "openai"

    def __init__(self, api_key: str, model: str) -> None:
        self.api_key = api_key
        self.model = model or DEFAULT_MODEL

    async def complete(self, prompt: str, system: str | None = None, max_tokens: int = 1024) -> Completion:
        headers = {"authorization": f"Bearer {self.api_key}", "content-type": "application/json"}
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        body = {"model": self.model, "messages": messages, "max_tokens": max_tokens}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=body)
            resp.raise_for_status()
            data = resp.json()
        text = data["choices"][0]["message"]["content"]
        return Completion(text=text, model=self.model, provider=self.name)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        headers = {"authorization": f"Bearer {self.api_key}", "content-type": "application/json"}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.openai.com/v1/embeddings",
                headers=headers,
                json={"model": DEFAULT_EMBED_MODEL, "input": texts},
            )
            resp.raise_for_status()
            data = resp.json()
        return [item["embedding"] for item in data["data"]]

    async def healthy(self) -> bool:
        return bool(self.api_key)
