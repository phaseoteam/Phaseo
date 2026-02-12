import json

from ai_stats import AIStats, create_ai_stats_devtools
from gen import operations as ops


def test_devtools_records_chat_completion(tmp_path, monkeypatch):
    def fake_create_chat_completion(client, body):
        return {
            "model": body["model"],
            "provider": "openai",
            "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
            "choices": [{"index": 0, "message": {"role": "assistant", "content": "hi"}}],
        }

    monkeypatch.setattr(ops, "createChatCompletion", fake_create_chat_completion)

    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        devtools=create_ai_stats_devtools(enabled=True, directory=str(tmp_path)),
    )

    client.generate_text(
        {
            "model": "openai/gpt-5-nano",
            "messages": [{"role": "user", "content": "hi"}],
        }
    )

    generations_path = tmp_path / "generations.jsonl"
    assert generations_path.exists()
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 1
    assert rows[0]["type"] == "chat.completions"
    assert rows[0]["metadata"]["sdk"] == "python"
    assert rows[0]["metadata"]["usage"]["total_tokens"] == 3


def test_devtools_records_errors(tmp_path, monkeypatch):
    class Boom(Exception):
        pass

    def fake_create_chat_completion(client, body):
        raise Boom("boom")

    monkeypatch.setattr(ops, "createChatCompletion", fake_create_chat_completion)

    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        devtools=create_ai_stats_devtools(enabled=True, directory=str(tmp_path)),
    )

    try:
        client.generate_text(
            {
                "model": "openai/gpt-5-nano",
                "messages": [{"role": "user", "content": "hi"}],
            }
        )
    except Boom:
        pass

    generations_path = tmp_path / "generations.jsonl"
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 1
    assert rows[0]["type"] == "chat.completions"
    assert rows[0]["error"]["type"] == "Boom"
