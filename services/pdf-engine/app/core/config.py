from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# services/pdf-engine/app/core/config.py -> parents[4] == monorepo root
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
    storage_provider: str = "local"
    storage_local_root: str = "./data/files"

    def resolved_storage_root(self) -> Path:
        raw = self.storage_local_root.lstrip("./")
        p = Path(self.storage_local_root)
        return p if p.is_absolute() else REPO_ROOT / raw


@lru_cache
def get_settings() -> Settings:
    return Settings()
