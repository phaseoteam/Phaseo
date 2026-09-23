from __future__ import annotations

import json
import urllib.error
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

import httpx


class PhaseoAPIError(Exception):
    """A structured error returned by the Phaseo Gateway."""

    def __init__(
        self,
        *,
        status_code: Optional[int],
        status_text: str = "",
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
        raw_body: str = "",
        cause: Optional[BaseException] = None,
    ) -> None:
        self.status_code = status_code
        self.status = status_code
        self.status_text = status_text or ""
        self.headers = {str(key).lower(): str(value) for key, value in (headers or {}).items()}
        self.body = body
        self.raw_body = raw_body

        payload = body if isinstance(body, Mapping) else {}
        error_value = payload.get("error")
        nested_error = error_value if isinstance(error_value, Mapping) else {}
        self.request_id = _first_string(
            payload.get("request_id"),
            self.headers.get("x-request-id"),
            self.headers.get("request-id"),
        )
        self.generation_id = _first_string(payload.get("generation_id"))
        self.error_type = _first_string(payload.get("error_type"))
        self.error_origin = _first_string(payload.get("error_origin"))
        self.error_code = _first_string(payload.get("code"), payload.get("error"), nested_error.get("code"))
        self.reason = _first_string(payload.get("reason"))
        self.action = _first_string(payload.get("action"))
        self.docs_url = _first_string(payload.get("docs_url"))
        self.support_url = _first_string(payload.get("support_url"))
        self.retryable = payload.get("retryable") if isinstance(payload.get("retryable"), bool) else None
        self.retry_after_seconds = _retry_after_seconds(
            payload.get("retry_after_seconds"),
            self.headers.get("retry-after"),
        )
        self.details = payload.get("details")

        message = _first_string(
            payload.get("message"),
            payload.get("description"),
            self.reason,
            nested_error.get("message"),
            error_value if isinstance(error_value, str) else None,
            raw_body.strip(),
        )
        status_label = f"{status_code} {self.status_text}".strip() if status_code else "Gateway request"
        message = message or "Gateway request failed"
        super().__init__(f"{status_label}: {message}" if status_code else message)
        if cause is not None:
            self.__cause__ = cause

    @classmethod
    def from_httpx(cls, error: httpx.HTTPStatusError) -> "PhaseoAPIError":
        response = error.response
        raw_body = response.text
        return cls(
            status_code=response.status_code,
            status_text=response.reason_phrase,
            body=_decode_body(raw_body),
            headers=response.headers,
            raw_body=raw_body,
            cause=error,
        )

    @classmethod
    def from_urllib(cls, error: urllib.error.HTTPError) -> "PhaseoAPIError":
        try:
            raw_body = error.read().decode("utf-8", errors="replace")
        except Exception:
            raw_body = ""
        headers = {str(key): str(value) for key, value in error.headers.items()} if error.headers else {}
        return cls(
            status_code=error.code,
            status_text=str(error.reason or ""),
            body=_decode_body(raw_body),
            headers=headers,
            raw_body=raw_body,
            cause=error,
        )

    def to_devtools_error(self) -> dict[str, Any]:
        return {
            "message": str(self),
            "type": self.__class__.__name__,
            "code": self.error_code,
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


def _decode_body(raw: str) -> Any:
    text = raw.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def _first_string(*values: Any) -> Optional[str]:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _retry_after_seconds(value: Any, header: Optional[str]) -> Optional[int]:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(0, int(value))
    if header:
        try:
            return max(0, int(float(header.strip())))
        except ValueError:
            try:
                retry_at = datetime.strptime(header.strip(), "%a, %d %b %Y %H:%M:%S %Z").replace(tzinfo=timezone.utc)
                return max(0, int((retry_at - datetime.now(timezone.utc)).total_seconds()))
            except ValueError:
                return None
    return None


__all__ = ["PhaseoAPIError"]
