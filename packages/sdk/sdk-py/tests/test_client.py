from typing import Any

import pytest

from ai_stats import AIStats
from gen import models
from gen import operations as ops


def test_chat_completions_returns_payload(monkeypatch):
    payload = {
        "id": "req_py_chat_1",
        "nativeResponseId": "resp_123",
        "created": 1_723_000_000,
        "model": "openai/gpt-5-nano",
        "provider": "openai",
        "session_id": "session_py_chat_1",
        "upstream_request_id": "upstream_py_chat_1",
        "provider_attempts": [{"provider": "openai", "status_code": 200, "duration_ms": 412}],
        "pricing_lines": [{"provider": "openai", "cost_usd": 0.0025}],
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
    assert response["provider"] == "openai"
    assert response["id"] == "req_py_chat_1"
    assert response["nativeResponseId"] == "resp_123"
    assert response["session_id"] == "session_py_chat_1"
    assert response["upstream_request_id"] == "upstream_py_chat_1"
    assert response["provider_attempts"] == [{"provider": "openai", "status_code": 200, "duration_ms": 412}]
    assert response["pricing_lines"] == [{"provider": "openai", "cost_usd": 0.0025}]


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
        assert path == "/models"
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
    assert lifecycle_lookups == [("GET", "/models", {"model_id": "openai/new-model", "limit": 1})]


def test_cancel_batch_uses_generated_operation(monkeypatch):
    captured: list[tuple[str, dict[str, str]]] = []

    def fake_cancel_batch(_client, path):
        captured.append(("cancelBatch", path))
        return {"id": path["batch_id"], "status": "cancelling"}

    monkeypatch.setattr(ops, "cancelBatch", fake_cancel_batch)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.cancel_batch("batch_123")

    assert response["id"] == "batch_123"
    assert response["status"] == "cancelling"
    assert captured == [("cancelBatch", {"batch_id": "batch_123"})]


def test_batches_resource_cancel_uses_parent_helper(monkeypatch):
    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "cancel_batch", lambda batch_id: {"id": batch_id, "status": "cancelling"})

    assert client.batches.cancel("batch_456") == {"id": "batch_456", "status": "cancelling"}


def test_list_batches_uses_owned_batch_collection(monkeypatch):
    captured: list[tuple[str, str, dict[str, Any] | None]] = []

    def fake_request(method, path, *, query=None, headers=None, body=None):
        captured.append((method, path, query))
        return {
            "object": "list",
            "data": [
                {
                    "id": "batch_py_list_1",
                    "object": "batch",
                    "status": "in_progress",
                    "websocket_url": "wss://example.test/v1/async/batch/batch_py_list_1/ws",
                    "billing": {
                        "state": "estimated",
                        "reservation_status": "held",
                    },
                }
            ],
            "first_id": "batch_py_list_1",
            "last_id": "batch_py_list_1",
            "has_more": False,
        }

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "request", fake_request)

    response = client.list_batches({"status": "in_progress", "limit": 2})

    assert response["data"][0]["id"] == "batch_py_list_1"
    assert response["data"][0]["websocket_url"] == "wss://example.test/v1/async/batch/batch_py_list_1/ws"
    assert response["data"][0]["billing"]["reservation_status"] == "held"
    assert response["first_id"] == "batch_py_list_1"
    assert response["has_more"] is False
    assert captured == [("GET", "/batches", {"status": "in_progress", "limit": 2})]


def test_async_generated_model_annotations_preserve_response_shapes():
    def annotation_value(owner, field: str) -> str:
        annotation = owner.__annotations__[field]
        return getattr(annotation, "__forward_arg__", annotation)

    assert annotation_value(models.BatchResponse, "billing") == "NotRequired[BatchBillingSummary]"
    assert annotation_value(models.VideoGenerationResponse, "billing") == "NotRequired[VideoBillingSummary]"
    assert annotation_value(models.BatchListResponse, "data") == "NotRequired[List[BatchResponse]]"
    assert annotation_value(models.VideoListResponse, "data") == "NotRequired[List[VideoGenerationResponse]]"
    assert annotation_value(models.BatchModelsResponse, "data") == "NotRequired[List[BatchModelCapability]]"
    assert annotation_value(models.VideoModelsResponse, "data") == "NotRequired[List[VideoModelCapability]]"
    assert annotation_value(models.BatchModelCapability, "providers") == "NotRequired[List[BatchModelProviderCapability]]"
    assert annotation_value(models.VideoModelCapability, "providers") == "NotRequired[List[VideoModelProviderCapability]]"
    assert ops.listBatches.__annotations__["return"] == "BatchListResponse"
    assert ops.listVideos.__annotations__["return"] == "VideoListResponse"
    assert ops.listBatchModels.__annotations__["return"] == "BatchModelsResponse"
    assert ops.listVideoModels.__annotations__["return"] == "VideoModelsResponse"


def test_batches_resource_list_uses_parent_helper(monkeypatch):
    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "list_batches", lambda params=None: {"object": "list", "data": [], "params": params})

    assert client.batches.list({"status": "completed"}) == {
        "object": "list",
        "data": [],
        "params": {"status": "completed"},
    }


def test_list_batch_models_uses_batch_model_capability_endpoint(monkeypatch):
    captured: list[tuple[str, str, dict[str, Any] | None]] = []

    def fake_request(method, path, *, query=None, headers=None, body=None):
        captured.append((method, path, query))
        return {
            "object": "list",
            "data": [
                {
                    "model": "openai/gpt-5-mini",
                    "supported_params_detail": {
                        "endpoint": {
                            "supported": True,
                            "values": ["/v1/responses"],
                        }
                    },
                    "supported_parameters_detail": {
                        "endpoint": {
                            "supported": True,
                            "values": ["/v1/responses"],
                        }
                    },
                }
            ],
        }

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "request", fake_request)

    response = client.list_batch_models()

    assert response["data"][0]["model"] == "openai/gpt-5-mini"
    assert response["data"][0]["supported_parameters_detail"]["endpoint"]["values"] == ["/v1/responses"]
    assert captured == [("GET", "/batches/models", None)]


def test_generated_batch_model_operations_use_model_capability_paths():
    captured: list[tuple[str, str]] = []

    class FakeClient:
        def request(self, method, path, *, query=None, headers=None, body=None):
            captured.append((method, path))
            return {"object": "list", "data": []}

    client = FakeClient()

    assert ops.listBatchModels(client)["object"] == "list"
    assert ops.listBatchModelsAlias(client)["object"] == "list"
    assert captured == [
        ("GET", "/batches/models"),
        ("GET", "/batch/models"),
    ]


def test_batches_resource_list_models_uses_parent_helper(monkeypatch):
    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "list_batch_models", lambda: {"object": "list", "data": [{"model": "openai/gpt-5-mini"}]})

    assert client.batches.list_models() == {
        "object": "list",
        "data": [{"model": "openai/gpt-5-mini"}],
    }


def test_batch_helpers_preserve_gateway_metadata(monkeypatch):
    captured: list[tuple[str, dict[str, Any] | dict[str, str]]] = []

    def fake_create_batch(_client, body):
        captured.append(("createBatch", body))
        return {
            "id": "batch_py_1",
            "object": "batch",
            "status": "validating",
            "websocket_url": "wss://example.test/v1/async/batch/batch_py_1/ws",
            "webhook": {
                "url": "https://example.com/hooks/batch",
                "events": ["batch.completed"],
                "has_secret": True,
                "delivery": {
                    "status": "pending",
                    "attempt_count": 0,
                },
            },
            "provider": "openai",
            "request_id": "req_py_batch_1",
            "session_id": "session_py_batch_1",
            "pricing_lines": [{"provider": "openai", "cost_usd": 0.03}],
        }

    def fake_retrieve_batch(_client, path):
        captured.append(("retrieveBatch", path))
        return {
            "id": path["batch_id"],
            "object": "batch",
            "status": "completed",
            "provider": "openai",
            "request_id": "req_py_batch_2",
            "session_id": "session_py_batch_1",
            "request_counts": {"total": 4, "completed": 3, "failed": 1},
            "billing": {"charged": True, "cost_usd": 0.12},
        }

    monkeypatch.setattr(ops, "createBatch", fake_create_batch)
    monkeypatch.setattr(ops, "retrieveBatch", fake_retrieve_batch)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    created = client.create_batch({
        "input_file_id": "file_123",
        "endpoint": "/v1/responses",
        "completion_window": "24h",
        "session_id": "session_py_batch_1",
        "webhook": {
            "url": "https://example.com/hooks/batch",
            "secret": "whsec_batch",
            "events": ["batch.completed"],
        },
    })
    retrieved = client.get_batch("batch_py_1")

    assert created["provider"] == "openai"
    assert created["request_id"] == "req_py_batch_1"
    assert created["session_id"] == "session_py_batch_1"
    assert created["websocket_url"] == "wss://example.test/v1/async/batch/batch_py_1/ws"
    assert created["webhook"] == {
        "url": "https://example.com/hooks/batch",
        "events": ["batch.completed"],
        "has_secret": True,
        "delivery": {
            "status": "pending",
            "attempt_count": 0,
        },
    }
    assert created["pricing_lines"] == [{"provider": "openai", "cost_usd": 0.03}]

    assert retrieved["provider"] == "openai"
    assert retrieved["request_id"] == "req_py_batch_2"
    assert retrieved["session_id"] == "session_py_batch_1"
    assert retrieved["request_counts"] == {"total": 4, "completed": 3, "failed": 1}
    assert retrieved["billing"] == {"charged": True, "cost_usd": 0.12}
    assert captured == [
        ("createBatch", {
            "input_file_id": "file_123",
            "endpoint": "/v1/responses",
            "completion_window": "24h",
            "session_id": "session_py_batch_1",
            "webhook": {
                "url": "https://example.com/hooks/batch",
                "secret": "whsec_batch",
                "events": ["batch.completed"],
            },
        }),
        ("retrieveBatch", {"batch_id": "batch_py_1"}),
    ]


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


def test_video_helpers_preserve_gateway_metadata(monkeypatch):
    captured: list[tuple[str, dict[str, Any] | dict[str, str]]] = []

    def fake_create_video(_client, body):
        captured.append(("createVideo", body))
        return {
            "id": "G-py-video-1",
            "object": "video",
            "status": "queued",
            "websocket_url": "wss://example.test/v1/async/video/G-py-video-1/ws",
            "webhook": {
                "url": "https://example.com/hooks/video",
                "events": ["video.completed", "video.failed"],
                "has_secret": True,
                "delivery": {
                    "status": "pending",
                    "attempt_count": 0,
                },
            },
            "provider": "google",
            "model": "google/veo-3",
            "request_id": "req_py_video_1",
            "session_id": "session_py_video_1",
            "generation_id": "req_py_video_1",
            "output_access": "both",
            "billing": {"charged": False},
        }

    def fake_get_video(_client, path):
        captured.append(("getVideo", path))
        return {
            "id": path["video_id"],
            "object": "video",
            "status": "completed",
            "websocket_url": "wss://example.test/v1/async/video/G-py-video-1/ws",
            "provider": "google",
            "model": "google/veo-3",
            "request_id": "req_py_video_2",
            "session_id": "session_py_video_2",
            "generation_id": "req_py_video_1",
            "output_access": "both",
            "billing": {"charged": True, "cost_usd": 0.12},
        }

    monkeypatch.setattr(ops, "createVideo", fake_create_video)
    monkeypatch.setattr(ops, "getVideo", fake_get_video)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test", enable_deprecation_warnings=False)
    monkeypatch.setattr(
        client,
        "request",
        lambda method, path, *, query=None, headers=None, body=None: {
            "models": [{"model_id": "google/veo-3", "status": "active"}]
        },
    )

    created = client.generate_video({
        "model": "google/veo-3",
        "prompt": "orbital reveal",
        "webhook": {
            "url": "https://example.com/hooks/video",
            "secret": "whsec_video",
            "events": ["video.completed", "video.failed"],
        },
    })
    retrieved = client.get_video("G-py-video-1")

    assert created["provider"] == "google"
    assert created["request_id"] == "req_py_video_1"
    assert created["session_id"] == "session_py_video_1"
    assert created["generation_id"] == "req_py_video_1"
    assert created["output_access"] == "both"
    assert created["websocket_url"] == "wss://example.test/v1/async/video/G-py-video-1/ws"
    assert created["webhook"] == {
        "url": "https://example.com/hooks/video",
        "events": ["video.completed", "video.failed"],
        "has_secret": True,
        "delivery": {
            "status": "pending",
            "attempt_count": 0,
        },
    }
    assert created["billing"]["charged"] is False

    assert retrieved["provider"] == "google"
    assert retrieved["request_id"] == "req_py_video_2"
    assert retrieved["session_id"] == "session_py_video_2"
    assert retrieved["generation_id"] == "req_py_video_1"
    assert retrieved["output_access"] == "both"
    assert retrieved["websocket_url"] == "wss://example.test/v1/async/video/G-py-video-1/ws"
    assert retrieved["billing"]["charged"] is True
    assert captured == [
        ("createVideo", {
            "model": "google/veo-3",
            "prompt": "orbital reveal",
            "webhook": {
                "url": "https://example.com/hooks/video",
                "secret": "whsec_video",
                "events": ["video.completed", "video.failed"],
            },
        }),
        ("getVideo", {"video_id": "G-py-video-1"}),
    ]


def test_list_videos_uses_generated_operation(monkeypatch):
    captured: list[tuple[str, dict[str, Any]]] = []

    def fake_list_videos(_client, query=None, **_kwargs):
        captured.append(("listVideos", query or {}))
        return {
            "object": "list",
            "data": [
                {
                    "id": "G-py-video-1",
                    "status": "queued",
                    "websocket_url": "wss://example.test/v1/async/video/G-py-video-1/ws",
                },
                {
                    "id": "G-py-video-2",
                    "status": "completed",
                    "websocket_url": "wss://example.test/v1/async/video/G-py-video-2/ws",
                },
            ],
        }

    monkeypatch.setattr(ops, "listVideos", fake_list_videos)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.list_videos({"status": "queued,completed", "limit": 2})

    assert response["object"] == "list"
    assert len(response["data"]) == 2
    assert response["data"][0]["websocket_url"] == "wss://example.test/v1/async/video/G-py-video-1/ws"
    assert response["data"][1]["websocket_url"] == "wss://example.test/v1/async/video/G-py-video-2/ws"
    assert captured == [("listVideos", {"status": "queued,completed", "limit": 2})]


def test_videos_resource_list_uses_parent_helper(monkeypatch):
    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(
        client,
        "list_videos",
        lambda params=None: {"object": "list", "data": [{"id": "G-py-video-1"}], "params": params},
    )

    assert client.videos.list({"status": "queued"}) == {
        "object": "list",
        "data": [{"id": "G-py-video-1"}],
        "params": {"status": "queued"},
    }


def test_list_video_models_uses_video_model_capability_endpoint(monkeypatch):
    captured: list[tuple[str, str, dict[str, Any] | None]] = []

    def fake_request(method, path, *, query=None, headers=None, body=None):
        captured.append((method, path, query))
        return {
            "object": "list",
            "data": [
                {
                    "model": "openai/sora",
                    "supported_params_detail": {
                        "resolution": {
                            "supported": True,
                            "values": ["720p", "1080p"],
                        }
                    },
                    "supported_parameters_detail": {
                        "resolution": {
                            "supported": True,
                            "values": ["720p", "1080p"],
                        }
                    },
                }
            ],
        }

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "request", fake_request)

    response = client.list_video_models()

    assert response["object"] == "list"
    assert response["data"][0]["model"] == "openai/sora"
    assert response["data"][0]["supported_params_detail"]["resolution"]["values"] == ["720p", "1080p"]
    assert response["data"][0]["supported_parameters_detail"]["resolution"]["values"] == ["720p", "1080p"]
    assert captured == [("GET", "/videos/models", None)]


def test_generated_video_model_operations_include_alias(monkeypatch):
    captured: list[tuple[str, str]] = []

    def fake_request(method, path, *, query=None, headers=None, body=None):
        captured.append((method, path))
        return {"object": "list", "data": [{"model": "openai/sora"}]}

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "request", fake_request)

    assert ops.listVideoModels(client)["object"] == "list"
    assert ops.listVideoModelsAlias(client)["object"] == "list"
    assert captured == [
        ("GET", "/videos/models"),
        ("GET", "/video/generations/models"),
    ]


def test_videos_resource_list_models_uses_parent_helper(monkeypatch):
    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "list_video_models", lambda: {"object": "list", "data": [{"model": "openai/sora"}]})

    assert client.videos.list_models() == {
        "object": "list",
        "data": [{"model": "openai/sora"}],
    }


def test_get_file_content_downloads_bytes(monkeypatch):
    class FakeResponse:
        def __init__(self, content: bytes):
            self.content = content

        def raise_for_status(self):
            return None

    captured: list[tuple[str, dict[str, str], float | None]] = []

    def fake_get(url: str, *, headers=None, timeout=None):
        captured.append((url, headers or {}, timeout))
        return FakeResponse(b'{"ok":true}\n')

    monkeypatch.setattr("ai_stats.httpx.get", fake_get)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test", timeout=12.5)
    content = client.get_file_content("file_123")

    assert content == b'{"ok":true}\n'
    assert captured == [
        (
            "https://example.test/files/file_123/content",
            {
                "Authorization": "Bearer sk_test_123",
                "User-Agent": "ai-stats-python",
            },
            12.5,
        )
    ]


def test_files_resource_content_uses_parent_helper(monkeypatch):
    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "get_file_content", lambda file_id: f"content:{file_id}".encode("utf-8"))

    assert client.files.content("file_456") == b"content:file_456"


def test_get_generation_uses_generated_operation(monkeypatch):
    captured: list[tuple[str, dict[str, str]]] = []

    def fake_get_generation(_client, query=None, **_kwargs):
        captured.append(("getGeneration", query or {}))
        return {
            "id": query["id"],
            "provider": "openai",
            "request_id": "req_py_generation_1",
            "status_code": 200,
            "replay_supported": True,
            "replay_request": {
                "model": "openai/gpt-5-nano",
                "messages": [{"role": "user", "content": "hello"}],
            },
        }

    monkeypatch.setattr(ops, "getGeneration", fake_get_generation)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.get_generation("gen_123")

    assert response["id"] == "gen_123"
    assert response["provider"] == "openai"
    assert response["request_id"] == "req_py_generation_1"
    assert response["replay_supported"] is True
    assert response["replay_request"]["model"] == "openai/gpt-5-nano"
    assert captured == [("getGeneration", {"id": "gen_123"})]


def test_list_endpoints_uses_generated_operation(monkeypatch):
    captured: list[str] = []

    def fake_list_endpoints(_client, **_kwargs):
        captured.append("listEndpoints")
        return {
            "ok": True,
            "endpoints": ["chat/completions", "responses", "files"],
            "sample_models": ["openai/gpt-5-nano"],
        }

    monkeypatch.setattr(ops, "listEndpoints", fake_list_endpoints)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.list_endpoints()

    assert captured == ["listEndpoints"]
    assert response["ok"] is True
    assert response["sample_models"] == ["openai/gpt-5-nano"]


def test_list_organisations_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_list_organisations(_client, **kwargs):
        captured.append({"query": kwargs.get("query")})
        return {
            "ok": True,
            "limit": 2,
            "offset": 3,
            "total": 1,
            "organisations": [
                {
                    "organisation_id": "org_123",
                    "name": "Anthropic",
                    "country_code": "US",
                    "colour": "#D97706",
                }
            ],
        }

    monkeypatch.setattr(ops, "listOrganisations", fake_list_organisations)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.list_organisations({"limit": "2", "offset": "3"})

    assert captured == [{"query": {"limit": "2", "offset": "3"}}]
    assert response["ok"] is True
    assert response["organisations"][0]["organisation_id"] == "org_123"


def test_list_team_models_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_list_team_models(_client, **kwargs):
        captured.append({"query": kwargs.get("query")})
        return {
            "ok": True,
            "limit": 2,
            "models": [
                {
                    "id": "openai/gpt-5-mini",
                    "endpoints": ["responses"],
                }
            ],
        }

    monkeypatch.setattr(ops, "listTeamModels", fake_list_team_models)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.list_team_models({"limit": "2", "endpoints": "responses"})

    assert captured == [{"query": {"limit": "2", "endpoints": "responses"}}]
    assert response["ok"] is True
    assert response["models"][0]["id"] == "openai/gpt-5-mini"


def test_list_pricing_models_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_list_pricing_models(_client, **kwargs):
        captured.append({"query": kwargs.get("query")})
        return {
            "ok": True,
            "models": [
                {
                    "provider": "openai",
                    "model": "openai/gpt-5-mini",
                    "endpoint": "responses",
                    "display_name": "GPT-5 Mini",
                    "meters": [
                        {
                            "meter": "input_tokens",
                            "unit": "tokens",
                            "unit_size": 1000,
                            "price_per_unit": "0.00025",
                            "currency": "USD",
                        }
                    ],
                }
            ],
        }

    monkeypatch.setattr(ops, "listPricingModels", fake_list_pricing_models)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.list_pricing_models({"provider": "openai"})

    assert captured == [{"query": {"provider": "openai"}}]
    assert response["ok"] is True
    assert response["models"][0]["provider"] == "openai"


def test_calculate_pricing_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_calculate_pricing(_client, **kwargs):
        captured.append({"body": kwargs.get("body")})
        return {
            "ok": True,
            "pricing": {
                "total_cost_usd": 0.00025,
                "currency": "USD",
            },
        }

    monkeypatch.setattr(ops, "calculatePricing", fake_calculate_pricing)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.calculate_pricing({
        "provider": "openai",
        "model": "openai/gpt-5-mini",
        "endpoint": "responses",
        "usage": {"input_tokens": 1000},
    })

    assert captured == [{
        "body": {
            "provider": "openai",
            "model": "openai/gpt-5-mini",
            "endpoint": "responses",
            "usage": {"input_tokens": 1000},
        }
    }]
    assert response["ok"] is True
    assert response["pricing"]["total_cost_usd"] == 0.00025


def test_list_api_keys_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_list_api_keys(_client, **kwargs):
        captured.append({"query": kwargs.get("query")})
        return {
            "object": "list",
            "data": [
                {"id": "key_123", "status": "active"},
                {"id": "key_456", "status": "disabled"},
            ],
        }

    monkeypatch.setattr(ops, "listApiKeys", fake_list_api_keys)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.list_api_keys({"disabled": "true", "limit": "2"})

    assert captured == [{"query": {"disabled": "true", "limit": "2"}}]
    assert response["object"] == "list"
    assert response["data"][1]["status"] == "disabled"


def test_get_api_key_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_get_api_key(_client, **kwargs):
        captured.append({"path": kwargs.get("path")})
        return {
            "data": {
                "id": "key_123",
                "hash": "keyhash_123",
                "status": "active",
            }
        }

    monkeypatch.setattr(ops, "getApiKey", fake_get_api_key)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.get_api_key("key_123")

    assert captured == [{"path": {"id": "key_123"}}]
    assert response["data"]["id"] == "key_123"
    assert response["data"]["hash"] == "keyhash_123"


def test_list_workspaces_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_list_workspaces(_client, **kwargs):
        captured.append({"query": kwargs.get("query")})
        return {
            "object": "list",
            "data": [
                {"id": "ws_123", "slug": "default"},
                {"id": "ws_456", "slug": "sandbox"},
            ],
        }

    monkeypatch.setattr(ops, "listWorkspaces", fake_list_workspaces)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.list_workspaces({"limit": "2", "offset": "3"})

    assert captured == [{"query": {"limit": "2", "offset": "3"}}]
    assert response["object"] == "list"
    assert response["data"][1]["slug"] == "sandbox"


def test_get_workspace_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_get_workspace(_client, **kwargs):
        captured.append({"path": kwargs.get("path")})
        return {
            "data": {
                "id": "ws_123",
                "slug": "default",
                "name": "Default Workspace",
            }
        }

    monkeypatch.setattr(ops, "getWorkspace", fake_get_workspace)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.get_workspace("ws_123")

    assert captured == [{"path": {"id": "ws_123"}}]
    assert response["data"]["id"] == "ws_123"
    assert response["data"]["name"] == "Default Workspace"


def test_create_workspace_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_create_workspace(_client, **kwargs):
        captured.append({"body": kwargs.get("body")})
        return {
            "data": {
                "id": "ws_123",
                "slug": "sandbox",
                "name": "Sandbox Workspace",
            }
        }

    monkeypatch.setattr(ops, "createWorkspace", fake_create_workspace)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.create_workspace({"name": "Sandbox Workspace", "slug": "sandbox"})

    assert captured == [{"body": {"name": "Sandbox Workspace", "slug": "sandbox"}}]
    assert response["data"]["id"] == "ws_123"
    assert response["data"]["slug"] == "sandbox"


def test_update_workspace_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_update_workspace(_client, **kwargs):
        captured.append({"path": kwargs.get("path"), "body": kwargs.get("body")})
        return {
            "data": {
                "id": "ws_123",
                "slug": "sandbox",
                "name": "Renamed Workspace",
                "archived": True,
            }
        }

    monkeypatch.setattr(ops, "updateWorkspace", fake_update_workspace)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.update_workspace("ws_123", {"name": "Renamed Workspace", "archived": True})

    assert captured == [{
        "path": {"id": "ws_123"},
        "body": {"name": "Renamed Workspace", "archived": True},
    }]
    assert response["data"]["id"] == "ws_123"
    assert response["data"]["archived"] is True


def test_delete_workspace_uses_generated_operation(monkeypatch):
    captured: list[dict[str, object]] = []

    def fake_delete_workspace(_client, **kwargs):
        captured.append({"path": kwargs.get("path")})
        return {
            "data": {
                "id": "ws_123",
                "deleted": True,
            }
        }

    monkeypatch.setattr(ops, "deleteWorkspace", fake_delete_workspace)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.delete_workspace("ws_123")

    assert captured == [{"path": {"id": "ws_123"}}]
    assert response["data"]["id"] == "ws_123"
    assert response["data"]["deleted"] is True


def test_provider_and_usage_helpers_use_generated_operations(monkeypatch):
    captured: list[tuple[str, dict[str, object] | None]] = []

    def fake_list_providers(_client, **kwargs):
        query = kwargs.get("query")
        captured.append(("listProviders", query))
        return {
            "ok": True,
            "providers": [
                {"provider_id": "openai", "name": "OpenAI"},
            ],
        }

    def fake_get_credits(_client, **kwargs):
        query = kwargs.get("query")
        captured.append(("getCredits", query))
        return {
            "ok": True,
            "credits": {
                "balance_usd": 42.5,
            },
        }

    def fake_get_activity(_client, **kwargs):
        query = kwargs.get("query")
        captured.append(("getActivity", query))
        return {
            "ok": True,
            "total": 1,
            "activity": [
                {"request_id": "req_123"},
            ],
        }

    def fake_get_analytics(_client, **kwargs):
        query = kwargs.get("query")
        captured.append(("getAnalytics", query))
        return {
            "data": [
                {"date": "2026-05-01", "endpoint_id": "responses", "requests": 12},
            ],
        }

    monkeypatch.setattr(ops, "listProviders", fake_list_providers)
    monkeypatch.setattr(ops, "getCredits", fake_get_credits)
    monkeypatch.setattr(ops, "getActivity", fake_get_activity)
    monkeypatch.setattr(ops, "getActivityAlias", fake_get_analytics)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    providers = client.list_providers({"limit": "2"})
    credits = client.get_credits({"team_id": "team_123"})
    activity = client.get_activity({"days": "30"})
    analytics = client.get_analytics({"date": "2026-05-01"})

    assert providers["providers"][0]["provider_id"] == "openai"
    assert credits["credits"]["balance_usd"] == 42.5
    assert activity["activity"][0]["request_id"] == "req_123"
    assert analytics["data"][0]["endpoint_id"] == "responses"
    assert captured == [
        ("listProviders", {"limit": "2"}),
        ("getCredits", {"team_id": "team_123"}),
        ("getActivity", {"days": "30"}),
        ("getAnalytics", {"date": "2026-05-01"}),
    ]


def test_get_current_api_key_uses_generated_operation(monkeypatch):
    captured: list[str] = []

    def fake_get_current_api_key(_client, **_kwargs):
        captured.append("getCurrentApiKey")
        return {
            "data": {
                "id": "key_123",
                "prefix": "aistats_v1_sk_test",
                "status": "active",
            }
        }

    monkeypatch.setattr(ops, "getCurrentApiKey", fake_get_current_api_key)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.get_current_api_key()

    assert captured == ["getCurrentApiKey"]
    assert response["data"]["id"] == "key_123"
    assert response["data"]["status"] == "active"


def test_get_models_preserves_preview_only_and_coming_soon_provider_availability_metadata(monkeypatch):
    captured: list[dict[str, object] | None] = []

    def fake_list_models(_client, query=None, **_kwargs):
        captured.append(query)
        return {
            "ok": True,
            "availability_mode": "all",
            "models": [
                {
                    "id": "openai/gpt-5-mini",
                    "model_id": "openai/gpt-5-mini",
                    "providers": [
                        {
                            "api_provider_id": "openai",
                            "is_active_gateway": False,
                            "availability_status": "coming_soon",
                            "availability_reason": "preview_only",
                            "provider_status": "beta",
                            "provider_routing_status": "active",
                            "model_routing_status": "active",
                            "capability_status": "coming_soon",
                            "endpoints": ["responses"],
                            "params": ["temperature"],
                        }
                    ],
                }
            ],
        }

    monkeypatch.setattr(ops, "listModels", fake_list_models)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.get_models({"availability": "all"})

    assert captured == [{"availability": "all"}]
    assert response["availability_mode"] == "all"
    assert response["models"][0]["providers"][0]["availability_status"] == "coming_soon"
    assert response["models"][0]["providers"][0]["availability_reason"] == "preview_only"
    assert response["models"][0]["providers"][0]["capability_status"] == "coming_soon"


def test_get_models_forwards_provider_availability_filters(monkeypatch):
    captured: list[dict[str, object] | None] = []

    def fake_list_models(_client, query=None, **_kwargs):
        captured.append(query)
        return {
            "ok": True,
            "models": [],
        }

    monkeypatch.setattr(ops, "listModels", fake_list_models)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.get_models({
        "provider_availability_status": ["coming_soon", "inactive"],
        "provider_availability_reason": ["preview_only", "provider_not_ready"],
    })

    assert captured == [{
        "provider_availability_status": ["coming_soon", "inactive"],
        "provider_availability_reason": ["preview_only", "provider_not_ready"],
    }]
    assert response["ok"] is True


def test_get_models_forwards_provider_and_capability_status_filters(monkeypatch):
    captured: list[dict[str, object] | None] = []

    def fake_list_models(_client, query=None, **_kwargs):
        captured.append(query)
        return {
            "ok": True,
            "models": [],
        }

    monkeypatch.setattr(ops, "listModels", fake_list_models)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.get_models({
        "provider_status": ["beta", "alpha"],
        "capability_status": ["coming_soon", "internal_testing", "disabled"],
    })

    assert captured == [{
        "provider_status": ["beta", "alpha"],
        "capability_status": ["coming_soon", "internal_testing", "disabled"],
    }]
    assert response["ok"] is True


def test_get_models_forwards_provider_and_model_routing_status_filters(monkeypatch):
    captured: list[dict[str, object] | None] = []

    def fake_list_models(_client, query=None, **_kwargs):
        captured.append(query)
        return {
            "ok": True,
            "models": [],
        }

    monkeypatch.setattr(ops, "listModels", fake_list_models)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    response = client.get_models({
        "provider_routing_status": ["deranked_lvl1", "disabled"],
        "model_routing_status": ["active", "deranked_lvl2"],
    })

    assert captured == [{
        "provider_routing_status": ["deranked_lvl1", "disabled"],
        "model_routing_status": ["active", "deranked_lvl2"],
    }]
    assert response["ok"] is True


def test_get_health_uses_generated_operation(monkeypatch):
    captured: list[tuple[str, str, dict[str, object] | None, dict[str, str] | None, object | None]] = []

    def fake_request(method: str, path: str, *, query=None, headers=None, body=None):
        captured.append((method, path, query, headers, body))
        return {
            "status": "ok",
            "timestamp": "2026-05-05T12:00:00.000Z",
        }

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    monkeypatch.setattr(client, "request", fake_request)
    response = client.get_health()

    assert captured == [("GET", "/health", None, None, None)]
    assert response["status"] == "ok"
    assert response["timestamp"] == "2026-05-05T12:00:00.000Z"


def test_api_key_mutation_helpers_use_generated_operations(monkeypatch):
    captured: list[tuple[str, dict[str, object] | dict[str, str]]] = []

    def fake_create_api_key(_client, **kwargs):
        body = kwargs.get("body") or {}
        captured.append(("createApiKey", body))
        return {"data": {"id": "key_123", "name": body.get("name"), "status": "active"}}

    def fake_update_api_key(_client, **kwargs):
        path = kwargs.get("path") or {}
        body = kwargs.get("body") or {}
        captured.append(("updateApiKey", {"id": path.get("id"), **body}))
        return {"data": {"id": path.get("id"), "name": body.get("name"), "status": "disabled"}}

    def fake_delete_api_key(_client, **kwargs):
        path = kwargs.get("path") or {}
        captured.append(("deleteApiKey", path))
        return {"data": {"id": path.get("id"), "deleted": True}}

    monkeypatch.setattr(ops, "createApiKey", fake_create_api_key)
    monkeypatch.setattr(ops, "updateApiKey", fake_update_api_key)
    monkeypatch.setattr(ops, "deleteApiKey", fake_delete_api_key)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")
    created = client.create_api_key({"name": "Admin Key", "scopes": ["gateway:read"]})
    updated = client.update_api_key("key_123", {"name": "Renamed Key", "disabled": True})
    deleted = client.delete_api_key("key_123")

    assert created["data"]["status"] == "active"
    assert updated["data"]["status"] == "disabled"
    assert deleted["data"]["deleted"] is True
    assert captured == [
        ("createApiKey", {"name": "Admin Key", "scopes": ["gateway:read"]}),
        ("updateApiKey", {"id": "key_123", "name": "Renamed Key", "disabled": True}),
        ("deleteApiKey", {"id": "key_123"}),
    ]


def test_provisioning_key_aliases_delegate_to_api_key_helpers(monkeypatch):
    captured: list[tuple[str, dict[str, object] | dict[str, str] | None]] = []

    def fake_list_api_keys(_client, **kwargs):
        captured.append(("listApiKeys", kwargs.get("query")))
        return {"object": "list", "data": [{"id": "key_123"}]}

    def fake_get_api_key(_client, **kwargs):
        captured.append(("getApiKey", kwargs.get("path")))
        return {"data": {"id": "key_123"}}

    def fake_create_api_key(_client, **kwargs):
        captured.append(("createApiKey", kwargs.get("body")))
        return {"data": {"id": "key_123", "name": "Agent Key"}}

    def fake_update_api_key(_client, **kwargs):
        path = kwargs.get("path") or {}
        body = kwargs.get("body") or {}
        captured.append(("updateApiKey", {"id": path.get("id"), **body}))
        return {"data": {"id": path.get("id"), "name": body.get("name")}}

    def fake_delete_api_key(_client, **kwargs):
        captured.append(("deleteApiKey", kwargs.get("path")))
        return {"data": {"id": "key_123", "deleted": True}}

    monkeypatch.setattr(ops, "listApiKeys", fake_list_api_keys)
    monkeypatch.setattr(ops, "getApiKey", fake_get_api_key)
    monkeypatch.setattr(ops, "createApiKey", fake_create_api_key)
    monkeypatch.setattr(ops, "updateApiKey", fake_update_api_key)
    monkeypatch.setattr(ops, "deleteApiKey", fake_delete_api_key)

    client = AIStats(api_key="sk_test_123", base_url="https://example.test")

    listed = client.list_provisioning_keys({"limit": "1"})
    created = client.create_provisioning_key({"name": "Agent Key"})
    fetched = client.get_provisioning_key("key_123")
    updated = client.update_provisioning_key("key_123", {"name": "Renamed Key"})
    deleted = client.delete_provisioning_key("key_123")

    assert listed["data"][0]["id"] == "key_123"
    assert created["data"]["name"] == "Agent Key"
    assert fetched["data"]["id"] == "key_123"
    assert updated["data"]["name"] == "Renamed Key"
    assert deleted["data"]["deleted"] is True
    assert captured == [
        ("listApiKeys", {"limit": "1"}),
        ("createApiKey", {"name": "Agent Key"}),
        ("getApiKey", {"id": "key_123"}),
        ("updateApiKey", {"id": "key_123", "name": "Renamed Key"}),
        ("deleteApiKey", {"id": "key_123"}),
    ]
