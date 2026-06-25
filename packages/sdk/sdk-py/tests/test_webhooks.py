from datetime import datetime, timezone, timedelta
import json

from ai_stats import compute_async_webhook_signature, verify_async_webhook_signature


SECRET = "whsec_test_123"
TIMESTAMP = "1781166600"
BODY = json.dumps(
    {
        "id": "evt_123",
        "type": "batch.completed",
        "data": {
            "id": "batch_123",
            "status": "completed",
        },
    },
    separators=(",", ":"),
)


def test_verify_async_webhook_signature_accepts_valid_signature():
    signature = compute_async_webhook_signature(SECRET, TIMESTAMP, BODY)

    assert verify_async_webhook_signature(
        secret=SECRET,
        body=BODY,
        headers={
            "x-ai-stats-timestamp": TIMESTAMP,
            "x-ai-stats-signature": signature,
        },
        now=datetime(2026, 6, 11, 8, 30, 30, tzinfo=timezone.utc),
    )


def test_verify_async_webhook_signature_rejects_tampered_body():
    signature = compute_async_webhook_signature(SECRET, TIMESTAMP, BODY)

    assert not verify_async_webhook_signature(
        secret=SECRET,
        body=BODY.replace("completed", "failed"),
        headers={
            "x-ai-stats-timestamp": TIMESTAMP,
            "x-ai-stats-signature": signature,
        },
        now=datetime(2026, 6, 11, 8, 30, tzinfo=timezone.utc),
    )


def test_verify_async_webhook_signature_rejects_stale_timestamp_by_default():
    signature = compute_async_webhook_signature(SECRET, TIMESTAMP, BODY)

    assert not verify_async_webhook_signature(
        secret=SECRET,
        body=BODY,
        headers={
            "x-ai-stats-timestamp": TIMESTAMP,
            "x-ai-stats-signature": signature,
        },
        now=datetime(2026, 6, 11, 8, 35, 1, tzinfo=timezone.utc),
    )


def test_verify_async_webhook_signature_accepts_iterable_headers_and_bytes():
    body = BODY.encode("utf-8")
    signature = compute_async_webhook_signature(SECRET, TIMESTAMP, body)

    assert verify_async_webhook_signature(
        secret=SECRET,
        body=body,
        headers=[
            ("x-ai-stats-timestamp", TIMESTAMP),
            ("x-ai-stats-signature", signature),
        ],
        now=datetime.fromisoformat("2026-06-11T08:30:00+00:00") + timedelta(seconds=1),
    )


def test_verify_async_webhook_signature_accepts_iso_timestamp_headers():
    timestamp = "2026-06-11T08:30:00.000Z"
    signature = compute_async_webhook_signature(SECRET, timestamp, BODY)

    assert verify_async_webhook_signature(
        secret=SECRET,
        body=BODY,
        headers={
            "x-ai-stats-timestamp": timestamp,
            "x-ai-stats-signature": signature,
        },
        now=datetime(2026, 6, 11, 8, 30, tzinfo=timezone.utc),
    )
