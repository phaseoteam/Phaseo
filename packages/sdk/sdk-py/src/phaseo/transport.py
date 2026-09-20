"""Shared handwritten HTTP transport. Generated operations accept this client unchanged."""
from __future__ import annotations

from contextlib import contextmanager
from email.utils import parsedate_to_datetime
import math
import time
from typing import Any, Iterator
from urllib.parse import quote

import httpx
from gen.client import Client


def request_trace_url(request_id: str) -> str:
    return f"https://phaseo.app/settings/usage/logs/requests/{quote(request_id, safe='')}"


class APIResponse(dict[str, Any]):
    """Backwards-compatible dictionary with typed transport metadata and text access."""
    def __init__(self, value: dict[str, Any], response: httpx.Response):
        super().__init__(value)
        self.request_id: str | None = response.headers.get("x-request-id") or response.headers.get("x-phaseo-request-id")
        self.trace_url: str | None = request_trace_url(self.request_id) if self.request_id else None
        self.status_code: int = response.status_code

    @property
    def output_text(self) -> str:
        from .helpers import output_text
        return output_text(self)


class PhaseoHTTPError(httpx.HTTPStatusError):
    def __init__(self, response: httpx.Response):
        try:
            self.body = response.json()
        except ValueError:
            self.body = response.text
        self.status = response.status_code
        self.request_id = response.headers.get("x-request-id") or response.headers.get("x-phaseo-request-id")
        self.trace_url = request_trace_url(self.request_id) if self.request_id else None
        error = self.body.get("error", self.body) if isinstance(self.body, dict) else {}
        self.code = error.get("code") if isinstance(error, dict) else error if isinstance(error, str) else None
        self.retry_after = retry_after(response)
        super().__init__(f"Phaseo request failed ({self.status}): {self.code or response.reason_phrase}", request=response.request, response=response)


def retry_after(response: httpx.Response) -> float | None:
    value = response.headers.get("retry-after")
    if value is None:
        return None
    try:
        seconds = float(value)
        return max(0.0, seconds) if math.isfinite(seconds) else None
    except ValueError:
        try:
            return max(0.0, parsedate_to_datetime(value).timestamp() - time.time())
        except (ValueError, TypeError, OverflowError):
            return None


def validate_controls(timeout: float | None, max_retries: int) -> None:
    if timeout is not None and (isinstance(timeout, bool) or not math.isfinite(timeout) or timeout <= 0):
        raise ValueError("timeout must be a finite positive number")
    if isinstance(max_retries, bool) or not isinstance(max_retries, int) or not 0 <= max_retries <= 10:
        raise ValueError("max_retries must be between 0 and 10")


def decode_response(response: httpx.Response) -> Any:
    if not response.is_success:
        raise PhaseoHTTPError(response)
    if not response.content:
        return None
    content_type = response.headers.get("content-type", "").split(";")[0]
    if content_type == "application/x-ndjson":
        return response.text
    if content_type.startswith(("audio/", "video/", "image/")) or content_type == "application/octet-stream":
        return response.content
    try:
        value = response.json()
        return APIResponse(value, response) if isinstance(value, dict) else value
    except ValueError:
        return response.text


class HttpClient(Client):
    def __init__(self, base_url: str, headers: dict[str, str], timeout: float | None = 60, max_retries: int = 0, http_client: httpx.Client | None = None):
        super().__init__(base_url, headers)
        validate_controls(timeout, max_retries)
        self.timeout = timeout
        self.max_retries = max_retries
        self.http = http_client or httpx.Client()
        self.owned = http_client is None

    @contextmanager
    def stream(self, method: str, url: str, **kwargs: Any) -> Iterator[httpx.Response]:
        kwargs.setdefault("timeout", self.timeout)
        kwargs.setdefault("headers", self._headers)
        kwargs.setdefault("follow_redirects", False)
        retries = self.max_retries if method.upper() in ("GET", "HEAD") else 0
        for attempt in range(retries + 1):
            context = self.http.stream(method, url, **kwargs)
            try:
                response = context.__enter__()
            except httpx.TransportError:
                if attempt >= retries:
                    raise
                time.sleep(min(.25 * 2 ** attempt, 5))
                continue
            if response.status_code in (408, 429, 500, 502, 503, 504) and attempt < retries:
                delay = retry_after(response)
                context.__exit__(None, None, None)
                time.sleep(delay if delay is not None else min(.25 * 2 ** attempt, 5))
                continue
            try:
                if not response.is_success:
                    response.read()
                    raise PhaseoHTTPError(response)
                yield response
            finally:
                context.__exit__(None, None, None)
            return

    def request(self, method: str, path: str, query: dict[str, Any] | None = None, headers: dict[str, str] | None = None, body: Any = None) -> Any:
        with self.stream(method, f"{self._base_url}{path}", params=query, headers={**self._headers, **(headers or {})}, json=body) as response:
            response.read()
            return decode_response(response)

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        with self.stream("GET", url, **kwargs) as response:
            response.read()
            return response

    def close(self) -> None:
        if self.owned:
            self.http.close()
