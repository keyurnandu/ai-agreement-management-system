import hashlib
from functools import lru_cache

import httpx

from .config import get_settings

EMBED_DIM = 64


def _mock_embed(text: str) -> list[float]:
    vec = [0.0] * EMBED_DIM
    for tok in text.lower().split():
        bucket = int(hashlib.md5(tok.encode()).hexdigest(), 16) % EMBED_DIM
        vec[bucket] += 1.0
    norm = sum(v * v for v in vec) ** 0.5 or 1.0
    return [v / norm for v in vec]


class MockEmbedder:
    """Deterministic, key-free embeddings so RAG works out of the box."""

    name = "mock"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [_mock_embed(t) for t in texts]


class OpenAIEmbedder:
    name = "openai"

    def __init__(self, api_key: str, model: str = "text-embedding-3-small") -> None:
        self.api_key = api_key
        self.model = model

    async def embed(self, texts: list[str]) -> list[list[float]]:
        headers = {"authorization": f"Bearer {self.api_key}", "content-type": "application/json"}
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.openai.com/v1/embeddings", headers=headers, json={"model": self.model, "input": texts}
            )
            r.raise_for_status()
            return [d["embedding"] for d in r.json()["data"]]


class AzureOpenAIEmbedder:
    name = "azure_openai"

    def __init__(self, api_key: str, endpoint: str, deployment: str, api_version: str) -> None:
        self.api_key = api_key
        self.endpoint = endpoint.rstrip("/")
        self.deployment = deployment
        self.api_version = api_version

    async def embed(self, texts: list[str]) -> list[list[float]]:
        url = (
            f"{self.endpoint}/openai/deployments/{self.deployment}/embeddings"
            f"?api-version={self.api_version}"
        )
        headers = {"api-key": self.api_key, "content-type": "application/json"}
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, headers=headers, json={"input": texts})
            r.raise_for_status()
            return [d["embedding"] for d in r.json()["data"]]


class OllamaEmbedder:
    name = "ollama"

    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model or "nomic-embed-text"

    async def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        async with httpx.AsyncClient(timeout=120) as client:
            for t in texts:
                r = await client.post(f"{self.base_url}/api/embeddings", json={"model": self.model, "prompt": t})
                r.raise_for_status()
                out.append(r.json().get("embedding", []))
        return out


@lru_cache
def get_embedder():
    """Embedding provider is independent of the chat provider (Claude has no embeddings API)."""
    s = get_settings()
    p = (s.embedding_provider or "mock").lower()
    if p == "openai" and s.openai_api_key:
        return OpenAIEmbedder(s.openai_api_key)
    if p == "azure_openai" and s.azure_openai_api_key and s.azure_openai_endpoint:
        deployment = s.azure_openai_embedding_deployment or s.ai_model
        if deployment:
            return AzureOpenAIEmbedder(
                s.azure_openai_api_key,
                s.azure_openai_endpoint,
                deployment,
                s.azure_openai_api_version,
            )
    if p == "ollama":
        return OllamaEmbedder(s.ollama_base_url, s.ai_model)
    return MockEmbedder()
