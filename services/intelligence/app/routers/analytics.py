from fastapi import APIRouter, Depends, HTTPException, status

from ..core.security import verify_service_token

router = APIRouter(prefix="/analytics", tags=["analytics"], dependencies=[Depends(verify_service_token)])


@router.post("/metrics", summary="Contract metrics & insights — Phase 4")
def metrics() -> dict:
    raise HTTPException(status.HTTP_501_NOT_IMPLEMENTED, "analytics metrics arrive in Phase 4")
