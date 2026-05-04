import pytest

from ai_stats import AIStats
from gen import operations as ops


def test_chat_completions_returns_payload(monkeypatch):
    payload = {
        "nativeResponseId": "resp_123",
        "created": 1_723_000_000,
        "model": "openai/gpt-5-nano",
        "provider": "openai",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": "hi"},
                "finish_reason": "stop",
            }
        ],
    }

    def fake_create_chat_completion(client, body):
        assert body["model"] == payload["model"]
        return payload

    monkeypatch.setattr(ops, "createChatCompletion", fake_create_chat_completion)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.chat.completions.create(
        {"model": payload["model"], "messages": [{"role": "user", "content": "hi"}]}
    )

    assert response["choices"][0]["message"]["content"] == "hi"


def test_chat_completions_propagates_errors(monkeypatch):
    class Boom(Exception):
        pass

    def fake_create_chat_completion(client, body):
        raise Boom("nope")

    monkeypatch.setattr(ops, "createChatCompletion", fake_create_chat_completion)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    with pytest.raises(Boom):
        client.chat.completions.create(
            {"model": "openai/gpt-5-nano", "messages": [{"role": "user", "content": "hi"}]}
        )


def test_non_active_status_blocks_request_dispatch(monkeypatch):
    called = False

    def fake_create_response(_client, body):
        nonlocal called
        called = True
        return {"id": "resp_123", "output_text": "ok"}

    def fake_request(method, path, *, query=None, headers=None, body=None):
        assert method == "GET"
        assert path == "/data/models"
        assert query == {"model_id": "openai/rumoured-model", "limit": 1}
        return {
            "models": [
                {
                    "model_id": "openai/rumoured-model",
                    "status": "rumoured",
                }
            ]
        }

    monkeypatch.setattr(ops, "createResponse", fake_create_response)
    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "request", fake_request)

    with pytest.raises(ValueError, match="not active for inference"):
        client.generate_response({"model": "openai/rumoured-model", "input": "first"})
    assert called is False


def test_warnings_as_errors_blocks_request_for_retired_models(monkeypatch):
    called = False

    def fake_create_response(_client, body):
        nonlocal called
        called = True
        return {"id": "resp_123"}

    def fake_request(method, path, *, query=None, headers=None, body=None):
        return {
            "models": [
                {
                    "model_id": "openai/retired-model",
                    "status": "retired",
                    "retirement_date": "2020-01-01T00:00:00Z",
                }
            ]
        }

    monkeypatch.setattr(ops, "createResponse", fake_create_response)
    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        warnings_as_errors=True,
    )
    monkeypatch.setattr(client, "request", fake_request)

    with pytest.raises(ValueError, match="retired"):
        client.generate_response({"model": "openai/retired-model", "input": "hi"})
    assert called is False


def test_can_disable_deprecation_warnings(monkeypatch):
    called = False
    lifecycle_lookups = []

    def fake_create_response(_client, body):
        nonlocal called
        called = True
        return {"id": "resp_123"}

    def fake_request(method, path, *, query=None, headers=None, body=None):
        lifecycle_lookups.append((method, path, query))
        return {
            "models": [
                {
                    "model_id": "openai/new-model",
                    "status": "active",
                }
            ]
        }

    monkeypatch.setattr(ops, "createResponse", fake_create_response)
    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        enable_deprecation_warnings=False,
    )
    monkeypatch.setattr(client, "request", fake_request)

    response = client.generate_response({"model": "openai/new-model", "input": "hi"})
    assert called is True
    assert response["id"] == "resp_123"
    assert lifecycle_lookups == [("GET", "/data/models", {"model_id": "openai/new-model", "limit": 1})]


def test_get_video_download_url_sends_request_body(monkeypatch):
    captured: list[tuple[str, str, dict[str, Any] | None, dict[str, str] | None, Any]] = []

    def fake_request(method, path, *, query=None, headers=None, body=None):
        captured.append((method, path, query, headers, body))
        return {
            "download_url": "https://example.test/v1/videos/G-abc/content",
            "expires_at": 1_800_000_000,
        }

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "request", fake_request)

    response = client.get_video_download_url(
        "G-abc",
        {"ttl_seconds": 600, "disposition": "inline", "index": 1},
    )

    assert response["download_url"] == "https://example.test/v1/videos/G-abc/content"
    assert captured == [
        (
            "POST",
            "/videos/G-abc/download_url",
            None,
            None,
            {"ttl_seconds": 600, "disposition": "inline", "index": 1},
        )
    ]
