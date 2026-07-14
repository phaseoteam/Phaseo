from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
import hashlib
import hmac
from typing import Optional, Union

AsyncWebhookHeaders = Union[Mapping[str, object], Iterable[tuple[str, str]]]

DEFAULT_TOLERANCE_SECONDS = 300
SIGNATURE_HEADER = "x-phaseo-signature"
TIMESTAMP_HEADER = "x-phaseo-timestamp"


def _header_value(headers: AsyncWebhookHeaders, name: str) -> Optional[str]:
    target = name.lower()
    if isinstance(headers, Mapping):
        for key, value in headers.items():
            if str(key).lower() != target:
                continue
            if value is None:
                return None
            if isinstance(value, (list, tuple)):
                return None if not value else str(value[0])
            return str(value)
        return None
    for key, value in headers:
        if str(key).lower() == target:
            return str(value)
    return None


def _body_to_bytes(body: str | bytes | bytearray | memoryview) -> bytes:
    if isinstance(body, str):
        return body.encode("utf-8")
    return bytes(body)


def _parse_timestamp_ms(timestamp: str) -> Optional[float]:
    normalized = timestamp.strip()
    if normalized.isdigit():
        value = float(normalized)
        return value if len(normalized) >= 13 else value * 1000
    if normalized.endswith("Z"):
        normalized = f"{normalized[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp() * 1000


def _now_ms(now: datetime | int | float | None) -> Optional[float]:
    if now is None:
        return datetime.now(timezone.utc).timestamp() * 1000
    if isinstance(now, datetime):
        parsed = now if now.tzinfo else now.replace(tzinfo=timezone.utc)
        return parsed.timestamp() * 1000
    value = float(now)
    if value > 10_000_000_000:
        return value
    return value * 1000


def _is_fresh_timestamp(
    timestamp: str,
    tolerance_seconds: Optional[float],
    now: datetime | int | float | None,
) -> bool:
    if tolerance_seconds is None:
        return True
    if tolerance_seconds < 0:
        return False
    timestamp_ms = _parse_timestamp_ms(timestamp)
    current_ms = _now_ms(now)
    if timestamp_ms is None or current_ms is None:
        return False
    return abs(current_ms - timestamp_ms) <= tolerance_seconds * 1000


def compute_async_webhook_signature(secret: str, timestamp: str, body: str | bytes | bytearray | memoryview) -> str:
    signed = timestamp.encode("utf-8") + b"." + _body_to_bytes(body)
    return hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()


def verify_async_webhook_signature(
    *,
    secret: str,
    body: str | bytes | bytearray | memoryview,
    headers: AsyncWebhookHeaders,
    tolerance_seconds: Optional[float] = DEFAULT_TOLERANCE_SECONDS,
    now: datetime | int | float | None = None,
) -> bool:
    normalized_secret = secret.strip()
    if not normalized_secret:
        return False
    timestamp = _header_value(headers, TIMESTAMP_HEADER)
    signature = _header_value(headers, SIGNATURE_HEADER)
    if not timestamp or not signature:
        return False
    if not _is_fresh_timestamp(timestamp, tolerance_seconds, now):
        return False
    expected = compute_async_webhook_signature(normalized_secret, timestamp, body)
    return hmac.compare_digest(signature.strip().lower(), expected)
