"""Shared handwritten HTTP transport. Generated operations accept this client unchanged."""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
import math
import time
from typing import Any, Callable, Generic, Iterator, TypeVar
from urllib.parse import quote

import httpx
from gen.client import Client

T = TypeVar("T")
RequestHook = Callable[[dict[str, Any]], None]


@dataclass(frozen=True)
class RawResponse(Generic[T]):
    data: T
    status_code: int
    headers: httpx.Headers
    request_id: str | None
    trace_url: str | None


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
        payload = self.body if isinstance(self.body, dict) else {}
        nested_error = payload.get("error") if isinstance(payload.get("error"), dict) else {}
        self.status_code = response.status_code
        self.request_id = payload.get("request_id") or response.headers.get("x-request-id") or response.headers.get("x-phaseo-request-id")
        self.generation_id = payload.get("generation_id") or self.request_id
        self.trace_url = request_trace_url(self.request_id) if self.request_id else None
        error = payload.get("error", payload)
        self.code = payload.get("code") or (error.get("code") if isinstance(error, dict) else error if isinstance(error, str) else None)
        self.error_type = payload.get("error_type")
        self.error_origin = payload.get("error_origin")
        self.retryable = payload.get("retryable") if isinstance(payload.get("retryable"), bool) else None
        self.action = payload.get("action")
        self.docs_url = payload.get("docs_url")
        self.support_url = payload.get("support_url")
        self.retry_after_seconds = _retry_after_seconds(payload.get("retry_after_seconds"), response.headers.get("retry-after"))
        self.details = payload.get("details")
        self.retry_after = retry_after(response)
        message = payload.get("message") or payload.get("description") or self.code or response.reason_phrase
        super().__init__(f"Phaseo request failed ({self.status}): {message}", request=response.request, response=response)

    def to_devtools_error(self) -> dict[str, Any]:
        return {
            "message": str(self),
            "type": self.__class__.__name__,
            "code": self.code,
            "status": self.status_code,
            "status_code": self.status_code,
            "request_id": self.request_id,
            "generation_id": self.generation_id,
            "error_type": self.error_type,
            "error_origin": self.error_origin,
            "retryable": self.retryable,
            "action": self.action,
            "docs_url": self.docs_url,
            "support_url": self.support_url,
            "retry_after_seconds": self.retry_after_seconds,
            "details": self.details,
        }


def _retry_after_seconds(value: Any, header: str | None) -> int | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(0, int(value))
    if header:
        try:
            return max(0, int(float(header.strip())))
        except ValueError:
            return None
    return None


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
    def __init__(self, base_url: str, headers: dict[str, str], timeout: float | None = 60, max_retries: int = 0, http_client: httpx.Client | None = None,
                 on_request: RequestHook | None = None, on_response: RequestHook | None = None, on_retry: RequestHook | None = None):
        super().__init__(base_url, headers)
        validate_controls(timeout, max_retries)
        self.timeout = timeout
        self.max_retries = max_retries
        self.http = http_client or httpx.Client()
        self.owned = http_client is None
        self.on_request, self.on_response, self.on_retry = on_request, on_response, on_retry

    @contextmanager
    def stream(self, method: str, url: str, **kwargs: Any) -> Iterator[httpx.Response]:
        timeout = kwargs.pop("request_timeout", self.timeout)
        max_retries = kwargs.pop("max_retries", self.max_retries)
        idempotency_key = kwargs.pop("idempotency_key", None)
        kwargs.setdefault("timeout", timeout)
        request_headers = {**self._headers, **kwargs.pop("headers", {})}
        if idempotency_key:
            request_headers["Idempotency-Key"] = idempotency_key
        kwargs["headers"] = request_headers
        kwargs.setdefault("follow_redirects", False)
        validate_controls(timeout, max_retries)
        retries = max_retries if method.upper() in ("GET", "HEAD") else 0
        for attempt in range(retries + 1):
            if self.on_request:
                self.on_request({"method": method.upper(), "attempt": attempt})
            context = self.http.stream(method, url, **kwargs)
            try:
                response = context.__enter__()
            except httpx.TransportError as error:
                if attempt >= retries:
                    raise
                delay = min(.25 * 2 ** attempt, 5)
                if self.on_retry:
                    self.on_retry({"method": method.upper(), "attempt": attempt + 1, "delay": delay, "error": error})
                time.sleep(delay)
                continue
            if response.status_code in (408, 429, 500, 502, 503, 504) and attempt < retries:
                delay = retry_after(response)
                context.__exit__(None, None, None)
                wait = delay if delay is not None else min(.25 * 2 ** attempt, 5)
                if self.on_retry:
                    self.on_retry({"method": method.upper(), "attempt": attempt + 1, "status_code": response.status_code, "delay": wait})
                time.sleep(wait)
                continue
            if self.on_response:
                self.on_response({"method": method.upper(), "attempt": attempt, "status_code": response.status_code, "headers": response.headers})
            try:
                if not response.is_success:
                    response.read()
                    raise PhaseoHTTPError(response)
                yield response
            finally:
                context.__exit__(None, None, None)
            return

    def request(self, method: str, path: str, query: dict[str, Any] | None = None, headers: dict[str, str] | None = None, body: Any = None,
                *, timeout: float | None = None, max_retries: int | None = None, idempotency_key: str | None = None) -> Any:
        return self.request_with_response(method, path, query, headers, body, timeout=timeout, max_retries=max_retries, idempotency_key=idempotency_key).data

    def request_with_response(self, method: str, path: str, query: dict[str, Any] | None = None, headers: dict[str, str] | None = None, body: Any = None,
                              *, timeout: float | None = None, max_retries: int | None = None, idempotency_key: str | None = None) -> RawResponse[Any]:
        with self.stream(method, f"{self._base_url}{path}", params=query, headers=headers or {}, json=body,
                         request_timeout=self.timeout if timeout is None else timeout,
                         max_retries=self.max_retries if max_retries is None else max_retries,
                         idempotency_key=idempotency_key) as response:
            response.read()
            data = decode_response(response)
            request_id = response.headers.get("x-request-id") or response.headers.get("x-phaseo-request-id")
            return RawResponse(data, response.status_code, response.headers, request_id, request_trace_url(request_id) if request_id else None)

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        with self.stream("GET", url, **kwargs) as response:
            response.read()
            return response

    def close(self) -> None:
        if self.owned:
            self.http.close()
