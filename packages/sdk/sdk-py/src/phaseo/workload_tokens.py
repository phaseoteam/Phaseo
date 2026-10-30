"""Built-in ``api_key`` functions for trusted workloads on GitHub Actions and Vercel.

Each returns a function to pass as ``api_key``. It fetches an OIDC token issued to
Phaseo and reuses it until a minute before it expires.
"""

from __future__ import annotations

import base64
import json
import os
import threading
import time
from typing import Any, Callable, Mapping, Optional, Union
from urllib.parse import quote

import httpx

DEFAULT_AUDIENCE = "https://api.phaseo.app"
VERCEL_EXCHANGE_URL = "https://oidc.vercel.com/~token"
_TIMEOUT = 10.0
_REFRESH_MARGIN = 60.0


def _jwt_expiry(token: str) -> Optional[float]:
    """Reads a JWT's ``exp`` without checking its signature."""
    try:
        payload = token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
        exp = claims.get("exp")
        return float(exp) if isinstance(exp, (int, float)) and not isinstance(exp, bool) else None
    except (IndexError, ValueError, AttributeError):
        return None


def _fresh(expires_at: Optional[float], clock: Callable[[], float]) -> bool:
    return expires_at is not None and expires_at - _REFRESH_MARGIN > clock()


def _json(response: httpx.Response) -> dict[str, Any]:
    try:
        data = response.json()
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def github_actions_token(
    audience: str = DEFAULT_AUDIENCE,
    *,
    http_client: Optional[httpx.Client] = None,
    env: Optional[Mapping[str, str]] = None,
    clock: Callable[[], float] = time.time,
) -> Callable[[], str]:
    """Returns an ``api_key`` function for GitHub Actions.

    The job needs ``permissions: id-token: write``.
    """
    lock = threading.Lock()
    cached: dict[str, Any] = {}

    def provider() -> str:
        with lock:
            if cached and _fresh(cached["expires_at"], clock):
                return cached["token"]
            environment = os.environ if env is None else env
            url = environment.get("ACTIONS_ID_TOKEN_REQUEST_URL")
            request_token = environment.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN")
            if not url or not request_token:
                raise RuntimeError(
                    "GitHub Actions OIDC is unavailable: ACTIONS_ID_TOKEN_REQUEST_URL and "
                    "ACTIONS_ID_TOKEN_REQUEST_TOKEN are not set. Give the job `permissions: id-token: write`."
                )
            separator = "&" if "?" in url else "?"
            client = http_client or httpx.Client(timeout=_TIMEOUT)
            try:
                response = client.get(
                    f"{url}{separator}audience={quote(audience, safe='')}",
                    headers={"Authorization": f"bearer {request_token}"},
                    timeout=_TIMEOUT,
                )
            finally:
                if http_client is None:
                    client.close()
            if response.status_code >= 400:
                raise RuntimeError(f"GitHub Actions OIDC token request failed with HTTP {response.status_code}.")
            value = _json(response).get("value")
            if not isinstance(value, str) or not value:
                raise RuntimeError("GitHub Actions OIDC token response had no `value`.")
            cached.update(token=value, expires_at=_jwt_expiry(value))
            return value

    return provider


def vercel_token(
    audience: str = DEFAULT_AUDIENCE,
    *,
    token: Union[str, Callable[[], str], None] = None,
    http_client: Optional[httpx.Client] = None,
    env: Optional[Mapping[str, str]] = None,
    clock: Callable[[], float] = time.time,
    exchange_url: str = VERCEL_EXCHANGE_URL,
) -> Callable[[], str]:
    """Returns an ``api_key`` function for Vercel.

    ``token`` is the deployment's Vercel OIDC token, or a function returning it, such
    as the request's ``x-vercel-oidc-token`` header. It defaults to the contents of
    ``VERCEL_OIDC_TOKEN_FILE``, then ``VERCEL_OIDC_TOKEN``.
    """
    lock = threading.Lock()
    cached: dict[str, Any] = {}

    def source_token() -> str:
        if token is not None:
            value = (token() if callable(token) else token).strip()
            if value:
                return value
            raise RuntimeError("The Vercel OIDC token is empty.")
        environment = os.environ if env is None else env
        path = environment.get("VERCEL_OIDC_TOKEN_FILE")
        if path:
            with open(path, encoding="utf-8") as handle:
                value = handle.read().strip()
            if value:
                return value
        value = (environment.get("VERCEL_OIDC_TOKEN") or "").strip()
        if value:
            return value
        raise RuntimeError(
            "No Vercel OIDC token: pass `token` (for example the request's `x-vercel-oidc-token` header), "
            "or set VERCEL_OIDC_TOKEN. Enable OIDC in the Vercel project's settings."
        )

    def provider() -> str:
        source = source_token()
        with lock:
            if cached.get("source") == source and _fresh(cached["expires_at"], clock):
                return cached["token"]
            client = http_client or httpx.Client(timeout=_TIMEOUT)
            try:
                response = client.post(
                    exchange_url,
                    json={"token": source, "aud": audience},
                    headers={"Accept": "application/json"},
                    timeout=_TIMEOUT,
                )
            finally:
                if http_client is None:
                    client.close()
            data = _json(response)
            if response.status_code >= 400:
                detail = data.get("error") if isinstance(data.get("error"), str) else f"HTTP {response.status_code}"
                raise RuntimeError(f"Vercel OIDC token exchange failed: {detail}")
            exchanged = data.get("token")
            if not isinstance(exchanged, str) or not exchanged:
                raise RuntimeError("Vercel OIDC token exchange returned no token.")
            expiry = data.get("expiry")
            expires_at = float(expiry) if isinstance(expiry, (int, float)) and not isinstance(expiry, bool) else _jwt_expiry(exchanged)
            cached.update(source=source, token=exchanged, expires_at=expires_at)
            return exchanged

    return provider
