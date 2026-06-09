from typing import Annotated

import jwt
from fastapi import Header, HTTPException, status

from .config import get_settings

ISSUER = "contract-platform-web"


def verify_service_token(
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """FastAPI dependency: validates the short-lived service JWT minted by the web app."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.split(" ", 1)[1]
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.service_jwt_secret,
            algorithms=["HS256"],
            issuer=ISSUER,
            options={"require": ["exp", "iss"]},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid service token: {exc}") from exc

    return payload
