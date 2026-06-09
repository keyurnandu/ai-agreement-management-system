from fastapi import APIRouter

from ..providers.factory import get_provider

router = APIRouter()


@router.get("/health")
async def health() -> dict:
    provider = get_provider()
    return {
        "status": "ok",
        "service": "intelligence",
        "provider": provider.name,
        "provider_healthy": await provider.healthy(),
    }
