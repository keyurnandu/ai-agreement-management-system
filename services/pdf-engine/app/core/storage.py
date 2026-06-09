from pathlib import Path

from .config import get_settings


class LocalStorage:
    """Filesystem-backed storage, mirroring the TypeScript StorageProvider."""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def _full(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not str(p).startswith(str(self.root)):
            raise ValueError(f"Invalid storage key: {key}")
        return p

    def put(self, key: str, data: bytes) -> int:
        p = self._full(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return len(data)

    def get(self, key: str) -> bytes:
        return self._full(key).read_bytes()

    def exists(self, key: str) -> bool:
        return self._full(key).exists()


def get_storage() -> LocalStorage:
    settings = get_settings()
    if settings.storage_provider == "s3":
        raise NotImplementedError("S3 storage lands in Phase 5; set STORAGE_PROVIDER=local.")
    return LocalStorage(settings.resolved_storage_root())
