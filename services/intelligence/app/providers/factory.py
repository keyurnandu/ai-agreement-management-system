from functools import lru_cache

from ..core.config import get_settings
from .anthropic import AnthropicProvider
from .base import AIProvider
from .mock import MockProvider
from .ollama import OllamaProvider
from .openai import OpenAIProvider

AVAILABLE = ["mock", "ollama", "anthropic", "openai"]


@lru_cache
def get_provider() -> AIProvider:
    s = get_settings()
    kind = s.ai_provider.lower()
    if kind == "ollama":
        return OllamaProvider(s.ollama_base_url, s.ai_model)
    if kind == "anthropic":
        return AnthropicProvider(s.anthropic_api_key, s.ai_model)
    if kind == "openai":
        return OpenAIProvider(s.openai_api_key, s.ai_model)
    return MockProvider(s.ai_model)
