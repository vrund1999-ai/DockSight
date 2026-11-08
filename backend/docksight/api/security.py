"""JWT bearer auth.

A single demo user keeps the project self-contained. In an Azure deployment this would be
replaced by Microsoft Entra ID: the SPA gets tokens via MSAL and the API validates them against
the tenant's JWKS, so only `current_user` changes.
"""

import hmac
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from docksight.config import Settings, get_settings

_bearer = HTTPBearer(auto_error=False)


def authenticate(username: str, password: str, settings: Settings) -> bool:
    return hmac.compare_digest(username, settings.demo_username) and hmac.compare_digest(
        password, settings.demo_password
    )


def issue_token(username: str, settings: Settings) -> tuple[str, int]:
    ttl = settings.jwt_ttl_minutes * 60
    now = datetime.now(UTC)
    claims = {"sub": username, "iat": now, "exp": now + timedelta(seconds=ttl)}
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm), ttl


def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> str:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Invalid or missing token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if creds is None:
        raise unauthorized
    try:
        claims = jwt.decode(
            creds.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except jwt.PyJWTError as exc:
        raise unauthorized from exc
    return claims["sub"]
