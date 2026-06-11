import httpx

from .base import AIProvider, Completion

DEFAULT_API_VERSION = "2024-08-01-preview"
DEFAULT_EMBED_DEPLOYMENT = "text-embedding-3-small"


class AzureOpenAIProvider(AIProvider):
    """Azure OpenAI via deployment-scoped Chat Completions + Embeddings APIs."""

    name = "azure_openai"

    def __init__(
        self,
        api_key: str,
        endpoint: str,
        deployment: str,
        api_version: str = DEFAULT_API_VERSION,
        embedding_deployment: str = "",
    ) -> None:
        self.api_key = api_key
        self.endpoint = endpoint.rstrip("/")
        self.deployment = deployment
        self.api_version = api_version or DEFAULT_API_VERSION
        self.embedding_deployment = embedding_deployment or DEFAULT_EMBED_DEPLOYMENT

    def _headers(self) -> dict[str, str]:
        return {"api-key": self.api_key, "content-type": "application/json"}

    def _deployment_url(self, deployment: str, path: str) -> str:
        return (
            f"{self.endpoint}/openai/deployments/{deployment}/{path}"
            f"?api-version={self.api_version}"
        )

    async def complete(self, prompt: str, system: str | None = None, max_tokens: int = 1024) -> Completion:
        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        body = {"messages": messages, "max_tokens": max_tokens}
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                self._deployment_url(self.deployment, "chat/completions"),
                headers=self._headers(),
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()
        text = data["choices"][0]["message"]["content"]
        return Completion(text=text, model=self.deployment, provider=self.name)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                self._deployment_url(self.embedding_deployment, "embeddings"),
                headers=self._headers(),
                json={"input": texts},
            )
            resp.raise_for_status()
            data = resp.json()
        return [item["embedding"] for item in data["data"]]

    async def healthy(self) -> bool:
        return bool(self.api_key and self.endpoint and self.deployment)
