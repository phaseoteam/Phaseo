import pytest

from ai_stats import AIStats


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

    def fake_create_chat_completion(body):
        model_id = body["model"] if isinstance(body, dict) else getattr(body, "model", None)
        assert model_id == payload["model"]
        return payload

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client._api, "create_chat_completion", fake_create_chat_completion)
    response = client.chat.completions.create(
        {"model": payload["model"], "messages": [{"role": "user", "content": "hi"}]}
    )

    assert response["choices"][0]["message"]["content"] == "hi"


def test_chat_completions_propagates_errors(monkeypatch):
    class Boom(Exception):
        pass

    def fake_create_chat_completion(body):
        raise Boom("nope")

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client._api, "create_chat_completion", fake_create_chat_completion)
    with pytest.raises(Boom):
        client.chat.completions.create(
            {"model": "openai/gpt-5-nano", "messages": [{"role": "user", "content": "hi"}]}
        )
