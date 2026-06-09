from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# services/intelligence/app/core/config.py -> parents[4] == monorepo root
REPO_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    """Reads the monorepo-root .env (single source of truth). Env vars override."""

    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_env: str = "development"
    service_jwt_secret: str = "dev-shared-service-secret-change-me"

    # AI provider selection
    ai_provider: str = "mock"  # mock | ollama | anthropic | openai
    ai_model: str = ""
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"

    # Vector store (RAG)
    vector_store: str = "local"
    vector_store_path: str = "./data/vectors"
    embedding_provider: str = "mock"

    def resolved_vector_path(self) -> Path:
        raw = self.vector_store_path.lstrip("./")
        p = Path(self.vector_store_path)
        return p if p.is_absolute() else REPO_ROOT / raw


@lru_cache
def get_settings() -> Settings:
    return Settings()
