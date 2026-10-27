"""Per-request credentials for trusted workloads.

``api_key`` may be a function that returns the credential for each request: an
API key, or a short-lived token such as a GitHub Actions or Vercel OIDC token.
It is called before every request and retry, so it can refresh tokens; cache
inside it if fetching a token is expensive.
"""

from __future__ import annotations

import asyncio
import inspect
from typing import Any, Awaitable, Callable, Union

ApiKeyProvider = Callable[[], Union[str, Awaitable[str]]]


def _checked(value: Any) -> str:
    credential = str(value or "").strip()
    if not credential:
        raise ValueError("The api_key function returned an empty credential.")
    return credential


def has_authorization(headers: dict[str, str]) -> bool:
    return any(name.lower() == "authorization" for name in headers)


def resolve_sync(provider: ApiKeyProvider) -> str:
    value = provider()
    if inspect.isawaitable(value):
        close = getattr(value, "close", None)
        if callable(close):
            close()
        raise TypeError("The api_key function returned an awaitable; use AsyncPhaseo for async credential functions.")
    return _checked(value)


async def resolve_async(provider: ApiKeyProvider, timeout: float | None) -> str:
    """Resolves the credential within the request timeout, so a hung function cannot outlive it."""

    async def call() -> Any:
        value = provider()
        return await value if inspect.isawaitable(value) else value

    return _checked(await asyncio.wait_for(call(), timeout))
