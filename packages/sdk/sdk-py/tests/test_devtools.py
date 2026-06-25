import json
import httpx

from ai_stats import AIStats, create_ai_stats_devtools
from gen import operations as ops


def test_devtools_records_chat_completion(tmp_path, monkeypatch):
    def fake_create_chat_completion(client, body):
        return {
            "model": body["model"],
            "provider": "openai",
            "session_id": "session_py_chat_1",
            "upstream_request_id": "upstream_py_chat_1",
            "pricing_lines": [{"provider": "openai", "cost_usd": 0.0025}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3},
            "request_id": "req_py_1",
            "latency_ms": 120,
            "generation_ms": 340,
            "provider_attempts": [{"provider": "openai", "status_code": 200, "duration_ms": 460}],
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
    assert rows[0]["metadata"]["request_id"] == "req_py_1"
    assert rows[0]["metadata"]["session_id"] == "session_py_chat_1"
    assert rows[0]["metadata"]["upstream_request_id"] == "upstream_py_chat_1"
    assert rows[0]["metadata"]["pricing_lines"] == [{"provider": "openai", "cost_usd": 0.0025}]
    assert rows[0]["metadata"]["provider_attempts"][0]["provider"] == "openai"
    assert rows[0]["metadata"]["latency_ms"] == 120


def test_devtools_records_errors(tmp_path, monkeypatch):
    def fake_create_chat_completion(client, body):
        request = httpx.Request("POST", "https://example.test/chat/completions")
        response = httpx.Response(
            429,
            request=request,
            json={
                "error": "rate limited",
                "request_id": "req_py_err_1",
                "provider_attempts": [{"provider": "openrouter", "status_code": 429, "duration_ms": 612}],
            },
        )
        raise httpx.HTTPStatusError("boom", request=request, response=response)

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
    except httpx.HTTPStatusError:
        pass

    generations_path = tmp_path / "generations.jsonl"
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 1
    assert rows[0]["type"] == "chat.completions"
    assert rows[0]["error"]["type"] == "HTTPStatusError"
    assert rows[0]["response"]["request_id"] == "req_py_err_1"
    assert rows[0]["metadata"]["request_id"] == "req_py_err_1"
    assert rows[0]["metadata"]["provider_attempts"][0]["status_code"] == 429


def test_devtools_records_batch_create_and_cancel(tmp_path, monkeypatch):
    def fake_create_batch(client, body):
        return {
            "id": "batch_123",
            "object": "batch",
            "status": "in_progress",
            "request_id": "req_py_batch_create_1",
            "provider": "openai",
            "endpoint": body["endpoint"],
        }

    def fake_cancel_batch(client, path):
        return {
            "id": path["batch_id"],
            "object": "batch",
            "status": "cancelling",
            "request_id": "req_py_batch_cancel_1",
            "provider": "openai",
        }

    monkeypatch.setattr(ops, "createBatch", fake_create_batch)
    monkeypatch.setattr(ops, "cancelBatch", fake_cancel_batch)

    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        devtools=create_ai_stats_devtools(enabled=True, directory=str(tmp_path)),
    )

    client.create_batch(
        {
            "endpoint": "responses",
            "input_file_id": "file_123",
            "session_id": "agent-run-42",
        }
    )
    client.cancel_batch("batch_123")

    generations_path = tmp_path / "generations.jsonl"
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]

    assert len(rows) == 2
    assert rows[0]["type"] == "batches.create"
    assert rows[0]["metadata"]["request_id"] == "req_py_batch_create_1"
    assert rows[0]["request"]["session_id"] == "agent-run-42"
    assert rows[1]["type"] == "batches.cancel"
    assert rows[1]["response"]["status"] == "cancelling"
    assert rows[1]["metadata"]["request_id"] == "req_py_batch_cancel_1"


def test_devtools_records_generation_lookup(tmp_path, monkeypatch):
    def fake_get_generation(client, query=None, **_kwargs):
        return {
            "id": query["id"],
            "provider": "openai",
            "request_id": "req_py_generation_1",
            "status_code": 200,
            "latency_ms": 42,
        }

    monkeypatch.setattr(ops, "getGeneration", fake_get_generation)

    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        devtools=create_ai_stats_devtools(enabled=True, directory=str(tmp_path)),
    )

    client.get_generation("gen_123")

    generations_path = tmp_path / "generations.jsonl"
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]

    assert len(rows) == 1
    assert rows[0]["type"] == "generations.retrieve"
    assert rows[0]["request"]["id"] == "gen_123"
    assert rows[0]["response"]["id"] == "gen_123"
    assert rows[0]["metadata"]["request_id"] == "req_py_generation_1"


def test_devtools_records_health_entries(tmp_path, monkeypatch):
    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        devtools=create_ai_stats_devtools(enabled=True, directory=str(tmp_path)),
    )

    monkeypatch.setattr(
        client,
        "request",
        lambda method, path, *, query=None, headers=None, body=None: {
            "status": "ok",
            "timestamp": "2026-05-05T12:00:00.000Z",
        },
    )

    response = client.get_health()

    assert response["status"] == "ok"
    generations_path = tmp_path / "generations.jsonl"
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]
    assert len(rows) == 1
    assert rows[0]["type"] == "health"
    assert rows[0]["request"] == {}
    assert rows[0]["response"]["status"] == "ok"


def test_devtools_records_video_lifecycle_entries(tmp_path, monkeypatch):
    def fake_create_video(client, body):
        return {
            "id": "G-py-video-1",
            "object": "video",
            "status": "queued",
            "provider": "google",
            "model": body["model"],
            "request_id": "req_py_video_1",
            "session_id": "session_py_video_1",
        }

    def fake_get_video(client, path):
        return {
            "id": path["video_id"],
            "object": "video",
            "status": "completed",
            "provider": "google",
            "model": "google/veo-3",
            "request_id": "req_py_video_2",
            "session_id": "session_py_video_2",
        }

    monkeypatch.setattr(ops, "createVideo", fake_create_video)
    monkeypatch.setattr(ops, "getVideo", fake_get_video)

    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        devtools=create_ai_stats_devtools(enabled=True, directory=str(tmp_path)),
        enable_deprecation_warnings=False,
    )
    monkeypatch.setattr(
        client,
        "request",
        lambda method, path, *, query=None, headers=None, body=None: {
            "id": "G-py-video-1",
            "object": "video",
            "status": "cancelled",
            "provider": "google",
            "model": "google/veo-3",
            "request_id": "req_py_video_3",
            "session_id": "session_py_video_3",
        },
    )

    monkeypatch.setattr(
        client,
        "_maybe_warn_for_payload",
        lambda payload: None,
    )

    client.generate_video({"model": "google/veo-3", "prompt": "orbital reveal"})
    client.get_video("G-py-video-1")
    client.cancel_video("G-py-video-1")

    generations_path = tmp_path / "generations.jsonl"
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]

    assert len(rows) == 3
    assert rows[0]["type"] == "video.generations"
    assert rows[0]["metadata"]["request_id"] == "req_py_video_1"
    assert rows[0]["metadata"]["session_id"] == "session_py_video_1"
    assert rows[1]["type"] == "video.retrieve"
    assert rows[1]["request"]["video_id"] == "G-py-video-1"
    assert rows[1]["metadata"]["request_id"] == "req_py_video_2"
    assert rows[1]["metadata"]["session_id"] == "session_py_video_2"
    assert rows[2]["type"] == "video.cancel"
    assert rows[2]["metadata"]["request_id"] == "req_py_video_3"
    assert rows[2]["metadata"]["session_id"] == "session_py_video_3"


def test_devtools_records_video_list_entries(tmp_path, monkeypatch):
    def fake_list_videos(client, query=None, **_kwargs):
        return {
            "object": "list",
            "data": [
                {"id": "G-py-video-1", "status": "queued"},
                {"id": "G-py-video-2", "status": "completed"},
            ],
        }

    monkeypatch.setattr(ops, "listVideos", fake_list_videos)

    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        devtools=create_ai_stats_devtools(enabled=True, directory=str(tmp_path)),
    )

    client.list_videos({"status": "queued,completed", "limit": 2})

    generations_path = tmp_path / "generations.jsonl"
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]

    assert len(rows) == 1
    assert rows[0]["type"] == "video.list"
    assert rows[0]["request"] == {"status": "queued,completed", "limit": 2}
    assert rows[0]["response"]["object"] == "list"


def test_devtools_records_control_plane_entries(tmp_path, monkeypatch):
    monkeypatch.setattr(ops, "listModels", lambda _client, query=None, **_kwargs: {
        "models": [{"model_id": "openai/gpt-5-mini"}],
    })
    monkeypatch.setattr(ops, "listProviders", lambda _client, query=None, **_kwargs: {
        "providers": [{"provider_id": "openai", "name": "OpenAI"}],
    })
    monkeypatch.setattr(ops, "getCredits", lambda _client, query=None, **_kwargs: {
        "credits": {"balance_usd": 42.5},
    })
    monkeypatch.setattr(ops, "getActivity", lambda _client, query=None, **_kwargs: {
        "ok": True,
        "total": 1,
        "activity": [{"request_id": "req_py_activity_1"}],
    })
    monkeypatch.setattr(ops, "getActivityAlias", lambda _client, query=None, **_kwargs: {
        "data": [{"date": "2026-05-01", "endpoint_id": "responses", "requests": 12}],
    })
    monkeypatch.setattr(ops, "listEndpoints", lambda _client, **_kwargs: {
        "data": [{"endpoint_id": "responses", "path": "/responses"}],
    })
    monkeypatch.setattr(ops, "listOrganisations", lambda _client, query=None, **_kwargs: {
        "total": 1,
        "organisations": [{"organisation_id": "org_123", "name": "Anthropic"}],
    })
    monkeypatch.setattr(ops, "listPricingModels", lambda _client, query=None, **_kwargs: {
        "models": [{"provider": "openai", "model": "openai/gpt-5-mini"}],
    })
    monkeypatch.setattr(ops, "calculatePricing", lambda _client, body=None, **_kwargs: {
        "pricing": {"total_cost_usd": 0.00025, "currency": "USD"},
    })
    monkeypatch.setattr(ops, "listApiKeys", lambda _client, query=None, **_kwargs: {
        "object": "list",
        "data": [{"id": "key_123", "status": "active"}],
    })
    monkeypatch.setattr(ops, "createApiKey", lambda _client, body=None, **_kwargs: {
        "data": {"id": "key_456", "status": "active"},
    })
    monkeypatch.setattr(ops, "getApiKey", lambda _client, path=None, **_kwargs: {
        "data": {"id": path["id"], "status": "active"},
    })
    monkeypatch.setattr(ops, "updateApiKey", lambda _client, path=None, body=None, **_kwargs: {
        "data": {"id": path["id"], "name": body["name"]},
    })
    monkeypatch.setattr(ops, "deleteApiKey", lambda _client, path=None, **_kwargs: {
        "data": {"id": path["id"], "deleted": True},
    })
    monkeypatch.setattr(ops, "listWorkspaces", lambda _client, query=None, **_kwargs: {
        "object": "list",
        "data": [{"id": "ws_123"}],
    })
    monkeypatch.setattr(ops, "getWorkspace", lambda _client, path=None, **_kwargs: {
        "data": {"id": path["id"], "name": "Default Workspace"},
    })
    monkeypatch.setattr(ops, "createWorkspace", lambda _client, body=None, **_kwargs: {
        "data": {"id": "ws_456", "slug": body["slug"]},
    })
    monkeypatch.setattr(ops, "updateWorkspace", lambda _client, path=None, body=None, **_kwargs: {
        "data": {"id": path["id"], "archived": body["archived"]},
    })
    monkeypatch.setattr(ops, "deleteWorkspace", lambda _client, path=None, **_kwargs: {
        "data": {"id": path["id"], "deleted": True},
    })
    monkeypatch.setattr(ops, "getCurrentApiKey", lambda _client, **_kwargs: {
        "data": {"id": "key_123", "status": "active"},
    })

    client = AIStats(
        api_key="sk_test_123",
        base_url="https://example.test",
        devtools=create_ai_stats_devtools(enabled=True, directory=str(tmp_path)),
    )
    monkeypatch.setattr(
        client,
        "request",
        lambda method, path, *, query=None, headers=None, body=None: {
            "status": "ok",
            "timestamp": "2026-05-05T12:00:00.000Z",
        },
    )

    client.get_models({"limit": "2"})
    client.list_providers({"limit": "2"})
    client.get_credits({"team_id": "team_123"})
    client.get_activity({"days": "30"})
    client.get_analytics({"date": "2026-05-01"})
    client.list_endpoints()
    client.list_organisations({"limit": "2", "offset": "3"})
    client.list_pricing_models({"provider": "openai"})
    client.calculate_pricing({"provider": "openai", "model": "openai/gpt-5-mini", "endpoint": "responses"})
    client.list_api_keys({"disabled": "true", "limit": "2"})
    client.create_api_key({"name": "Sandbox Key"})
    client.get_api_key("key_123")
    client.update_api_key("key_123", {"name": "Renamed Key"})
    client.delete_api_key("key_123")
    client.list_workspaces({"limit": "2"})
    client.get_workspace("ws_123")
    client.create_workspace({"name": "Sandbox Workspace", "slug": "sandbox"})
    client.update_workspace("ws_123", {"name": "Renamed Workspace", "archived": True})
    client.delete_workspace("ws_123")
    client.get_current_api_key()
    client.get_health()

    generations_path = tmp_path / "generations.jsonl"
    rows = [json.loads(line) for line in generations_path.read_text(encoding="utf-8").splitlines()]

    types = [row["type"] for row in rows]
    assert types == [
        "models.list",
        "providers",
        "credits",
        "activity",
        "analytics",
        "endpoints.list",
        "organisations.list",
        "pricing.models",
        "pricing.calculate",
        "provisioning.keys.list",
        "provisioning.keys.create",
        "provisioning.keys.get",
        "provisioning.keys.update",
        "provisioning.keys.delete",
        "provisioning.workspaces.list",
        "provisioning.workspaces.get",
        "provisioning.workspaces.create",
        "provisioning.workspaces.update",
        "provisioning.workspaces.delete",
        "key.current",
        "health",
    ]
    assert rows[0]["request"] == {"limit": "2"}
    assert rows[5]["response"]["data"][0]["endpoint_id"] == "responses"
    assert rows[8]["response"]["pricing"]["currency"] == "USD"
    assert rows[13]["response"]["data"]["deleted"] is True
    assert rows[18]["response"]["data"]["deleted"] is True
    assert rows[19]["response"]["data"]["id"] == "key_123"
    assert rows[20]["response"]["status"] == "ok"
