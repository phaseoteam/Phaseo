import asyncio
import json

import httpx
import pytest
from pydantic import BaseModel
from phaseo import AsyncPhaseo, Phaseo, PhaseoHTTPError, JobFailedError, JobTimeoutError, parse_output, check_capabilities, check_parameter_support, batch_results
from phaseo.testing import MockTransport, job_fixtures
from phaseo import collect_stream


def test_sync_transport_metadata_retries_and_post_safety():
    fixtures = MockTransport([
        {"method": "GET", "path": "/v1/health", "status": 429, "headers": {"retry-after": "0"}},
        {"method": "GET", "path": "/v1/health", "json": {"ok": True}, "headers": {"x-request-id": "req/1"}},
        {"method": "POST", "path": "/v1/music/generate", "status": 503, "json": {"error": {"code": "unavailable"}}},
    ])
    with httpx.Client(transport=fixtures) as http:
        with Phaseo(api_key="test", base_url="https://example.test/v1", http_client=http, max_retries=2) as client:
            result = client.request("GET", "/health")
            assert result == {"ok": True}
            assert result.trace_url.endswith("req%2F1")
            with pytest.raises(PhaseoHTTPError) as error:
                client.request("POST", "/music/generate", body={"model": "test"})
            assert error.value.code == "unavailable"
        assert not http.is_closed
    fixtures.assert_done()


def test_raw_response_idempotency_and_transport_hooks():
    events = []
    fixtures = MockTransport([
        {"method": "GET", "path": "/health", "status": 503, "headers": {"retry-after": "0"}},
        {"method": "GET", "path": "/health", "json": {"ok": True}, "headers": {"x-request-id": "req_raw"}},
        {"method": "POST", "path": "/responses", "json": {"id": "resp_1"}},
    ])
    with httpx.Client(transport=fixtures) as http:
        with Phaseo(
            api_key="test",
            base_url="https://example.test",
            http_client=http,
            on_request=lambda event: events.append(("request", event["attempt"])),
            on_retry=lambda event: events.append(("retry", event["attempt"])),
            on_response=lambda event: events.append(("response", event["status_code"])),
        ) as client:
            raw = client.request_with_response("GET", "/health", max_retries=1)
            assert raw.data == {"ok": True}
            assert raw.request_id == "req_raw"
            assert events == [("request", 0), ("retry", 1), ("request", 1), ("response", 200)]
            client.request("POST", "/responses", body={"model": "test"}, idempotency_key="idem-1")
    assert fixtures.requests[2].headers["idempotency-key"] == "idem-1"
    fixtures.assert_done()


def test_async_raw_response_and_idempotency():
    async def run():
        fixtures = MockTransport([
            {"method": "POST", "path": "/responses", "json": {"id": "resp_1"}, "headers": {"x-request-id": "req_async"}},
        ])
        async with httpx.AsyncClient(transport=fixtures) as http:
            async with AsyncPhaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
                raw = await client.request_with_response("POST", "/responses", body={"model": "test"}, idempotency_key="idem-async")
                assert raw.request_id == "req_async"
                assert raw.data["id"] == "resp_1"
        assert fixtures.requests[0].headers["idempotency-key"] == "idem-async"
        fixtures.assert_done()
    asyncio.run(run())


@pytest.mark.parametrize("kind,path", [("music", "/music/generate"), ("videos", "/videos"), ("batches", "/batches")])
def test_async_jobs_submit_once_and_resume(kind, path):
    async def run():
        fixtures = MockTransport(job_fixtures("/v1" + path, "job_1"))
        async with httpx.AsyncClient(transport=fixtures) as http:
            async with AsyncPhaseo(api_key="test", base_url="https://example.test/v1", http_client=http) as client:
                handle = await getattr(client, kind).start({"model": "test"})
                assert handle.to_dict()["id"] == "job_1"
                result = await getattr(client, kind).resume(handle.id).result(interval=.25)
                assert result["status"] == "completed"
            assert not http.is_closed
        fixtures.assert_done()
    asyncio.run(run())


def test_async_sync_completion_and_failed_job():
    async def run():
        mock = MockTransport([
            {"method": "POST", "path": "/music/generate", "json": {"id": "m1", "status": "completed", "output": [{"audio_url": "https://asset.test/music"}]}},
            {"method": "GET", "path": "/videos/v1", "json": {"id": "v1", "status": "failed", "error": {"code": "blocked"}}},
        ])
        async with httpx.AsyncClient(transport=mock) as http:
            client = AsyncPhaseo(api_key="test", base_url="https://example.test", http_client=http)
            result = await client.music.generate_and_wait({"model": "test"})
            assert result["output"][0]["audio_url"].endswith("music")
            with pytest.raises(JobFailedError) as error:
                await client.videos.resume("v1").result()
            assert error.value.response["error"]["code"] == "blocked"
        mock.assert_done()
    asyncio.run(run())


def test_async_wait_timeout_cancels_pending_http():
    async def run():
        stopped = asyncio.Event()
        async def handler(request):
            try:
                await asyncio.sleep(100)
            finally:
                stopped.set()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = AsyncPhaseo(api_key="test", http_client=http)
            with pytest.raises(JobTimeoutError) as error:
                await client.videos.wait("v1", timeout=.01)
            assert error.value.job_id == "v1"
            assert stopped.is_set()
    asyncio.run(run())


def test_async_text_stream_and_structured_output():
    class Answer(BaseModel):
        answer: int
    async def run():
        mock = MockTransport([
            {"method": "POST", "path": "/responses", "body": 'data: {"type":"response.output_text.delta","delta":"Hi"}\n\ndata: [DONE]\n\n', "headers": {"content-type": "text/event-stream"}},
            {"method": "POST", "path": "/responses", "json": {"output_text": '{"answer":42}'}},
        ])
        async with httpx.AsyncClient(transport=mock) as http:
            client = AsyncPhaseo(api_key="test", base_url="https://example.test", http_client=http)
            events = [event async for event in client.responses.stream({"model": "test", "input": "hi"})]
            assert events[0]["text"] == "Hi"
            parsed = await client.responses.parse({"model": "test", "input": "answer"}, Answer)
            assert parsed.answer == 42
        mock.assert_done()
    asyncio.run(run())


def test_helpers_preserve_batch_errors_and_validate_capabilities():
    raw = '{"custom_id":"one","error":{"code":"bad_input"},"text":"🎵"}\n'.encode()
    rows = list(batch_results(bytes([byte]) for byte in raw))
    assert rows[0]["error"]["code"] == "bad_input"
    assert rows[0]["text"] == "🎵"
    assert not check_capabilities({}, output_types=["video"])["ok"]
    assert check_capabilities({"modalities": {"output": ["video"]}}, output_types=["video"])["ok"]


def test_completed_response_does_not_duplicate_streamed_text():
    result = collect_stream([
        {"type": "response.output_text.delta", "text": "Hello"},
        {"type": "response.output_text.done", "text": "Hello"},
        {"type": "response.completed", "text": "Hello", "response": {"output_text": "Hello"}},
    ])
    assert result["text"] == "Hello"
    assert result["final_response"]["output_text"] == "Hello"


@pytest.mark.parametrize("resource,path", [("music", "/music/generate"), ("videos", "/videos"), ("batches", "/batches")])
def test_sync_handles_resume(resource, path):
    mock = MockTransport([{"method": "GET", "path": path + "/j1", "json": {"id": "j1", "status": "completed"}}])
    with httpx.Client(transport=mock) as http:
        with Phaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
            assert getattr(client, resource).resume("j1").result()["status"] == "completed"
    mock.assert_done()


def test_upload_uses_multipart_and_preserves_bytes():
    def handle(request):
        assert request.url.path == "/batches/files"
        assert request.headers["content-type"].startswith("multipart/form-data;")
        assert b'filename="batch.jsonl"' in request.content
        assert b'{"custom_id":"one"}' in request.content
        return httpx.Response(200, json={"id": "file_1"})
    with httpx.Client(transport=httpx.MockTransport(handle)) as http:
        with Phaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
            assert client.files.create({"file": b'{"custom_id":"one"}', "filename": "batch.jsonl", "purpose": "batch"})["id"] == "file_1"


def test_advertised_parameter_ranges():
    model = {"capabilities": {"parameters": ["duration"]}, "offers": [{"status": "active", "routable": True,
        "capabilities": {"parameters": ["duration"], "parameter_details": {"duration": {"minimum": 5, "maximum": 10, "step": 5}}}}]}
    assert check_capabilities(model, parameter_values={"duration": 10})["ok"]
    assert not check_capabilities(model, parameter_values={"duration": 7})["ok"]


def test_live_model_parameter_checks_identify_partial_support_and_invalid_values():
    capabilities = {
        "ok": True,
        "id": "openai/gpt-5",
        "endpoints": [
            {
                "id": "openai:responses",
                "endpoint": "responses",
                "public_path": "/v1/responses",
                "provider": {"id": "openai"},
                "routable": True,
                "status": "active",
                "capabilities": {
                    "parameters": ["temperature", "top_p"],
                    "parameter_details": {
                        "temperature": {"minimum": 0, "maximum": 2},
                        "top_p": {"minimum": 0, "maximum": 1},
                    },
                },
            },
            {
                "id": "azure:responses",
                "endpoint": "responses",
                "public_path": "/v1/responses",
                "provider": {"id": "azure"},
                "routable": True,
                "status": "active",
                "capabilities": {
                    "parameters": ["temperature"],
                    "parameter_details": {"temperature": {"minimum": 0, "maximum": 1}},
                },
            },
        ],
    }
    mock = MockTransport([
        {"method": "GET", "path": "/models/openai/gpt-5/endpoints", "json": capabilities},
        {"method": "GET", "path": "/models/openai/gpt-5/endpoints", "json": capabilities},
        {"method": "GET", "path": "/models/openai/gpt-5/endpoints", "json": capabilities},
        {"method": "GET", "path": "/data/models", "json": {"models": [{"model_id": "openai/gpt-5", "status": "active"}]}},
        {"method": "GET", "path": "/models/openai/gpt-5/endpoints", "json": capabilities},
    ])
    with httpx.Client(transport=mock) as http:
        with Phaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
            supported = client.models.check_parameters(
                "openai/gpt-5",
                {"temperature": 0.7, "top_p": 0.9},
                endpoint="responses",
            )
            assert supported["ok"]
            assert next(item for item in supported["parameters"] if item["name"] == "top_p")["status"] == "partial"
            assert [route["provider"] for route in supported["matching_routes"]] == ["openai"]

            invalid = client.models.check_parameters("openai/gpt-5", {"temperature": 3})
            assert not invalid["ok"]
            assert "temperature must be at most 2" in " ".join(invalid["issues"])

            unsupported = client.models.check_parameters("openai/gpt-5", {"seed": 42})
            assert unsupported["parameters"][0]["status"] == "unsupported"
            assert "seed is not supported" in " ".join(unsupported["issues"])

            preflight = client.models.preflight({"model": "openai/gpt-5", "input": "hello", "temperature": 0.7}, endpoint="responses")
            assert preflight["ok"]
            assert preflight["checked_parameters"] == {"temperature": 0.7}
    mock.assert_done()


def test_parameter_reports_validate_types_preserve_partial_issues_and_omit_unknown_routes():
    model = {
        "id": "test/model",
        "endpoints": [
            {
                "id": "wide",
                "provider": {"id": "wide"},
                "endpoint": "responses",
                "routable": True,
                "status": "active",
                "capabilities": {
                    "parameters": ["temperature", "count", "mode"],
                    "parameter_details": {
                        "temperature": {"type": "number", "maximum": 2, "step": 0.5},
                        "count": {"type": "integer"},
                        "mode": {"values": [1]},
                    },
                },
            },
            {
                "id": "narrow",
                "provider": {"id": "narrow"},
                "endpoint": "responses",
                "routable": True,
                "status": "active",
                "capabilities": {
                    "parameters": ["temperature", "count", "mode"],
                    "parameter_details": {
                        "temperature": {"type": "number", "maximum": 1, "step": 0.5},
                        "count": {"type": "integer"},
                        "mode": {"values": [1]},
                    },
                },
            },
            {
                "id": "unknown",
                "provider": {"id": "unknown"},
                "endpoint": "responses",
                "routable": True,
                "status": "active",
                "capabilities": {},
            },
        ],
    }

    partial = check_parameter_support(model, {"temperature": 1.5})
    assert partial["parameters"][0]["status"] == "partial"
    assert "at most 1" in " ".join(partial["parameters"][0]["issues"])
    assert partial["parameters"][0]["unsupported_by"] == []

    invalid_type = check_parameter_support(model, {"count": 1.5})
    assert invalid_type["parameters"][0]["status"] == "unsupported"
    assert "must be an integer" in " ".join(invalid_type["parameters"][0]["issues"])

    non_finite = check_parameter_support(model, {"temperature": float("inf")})
    assert "must be finite" in " ".join(non_finite["parameters"][0]["issues"])

    boolean_enum = check_parameter_support(model, {"mode": True})
    assert "must be one of" in " ".join(boolean_enum["parameters"][0]["issues"])


def test_model_capability_lookup_rejects_ambiguous_model_ids_before_requesting():
    mock = MockTransport([])
    with httpx.Client(transport=mock) as http:
        with Phaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
            with pytest.raises(ValueError, match="author/slug format"):
                client.models.capabilities("author/slug/extra")
    mock.assert_done()

    async def run():
        async_mock = MockTransport([])
        async with httpx.AsyncClient(transport=async_mock) as http:
            async with AsyncPhaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
                with pytest.raises(ValueError, match="author/slug format"):
                    await client.models.capabilities("author//slug")
        async_mock.assert_done()

    asyncio.run(run())


def test_async_models_parameter_check_uses_the_same_live_report():
    async def run():
        capabilities = {
            "ok": True,
            "id": "openai/gpt-5",
            "endpoints": [{
                "id": "openai:responses",
                "endpoint": "responses",
                "public_path": "/v1/responses",
                "provider": {"id": "openai"},
                "routable": True,
                "status": "active",
                "capabilities": {
                    "parameters": ["temperature"],
                    "parameter_details": {"temperature": {"minimum": 0, "maximum": 2}},
                },
            }],
        }
        mock = MockTransport([
            {"method": "GET", "path": "/models/openai/gpt-5/endpoints", "json": capabilities},
        ])
        async with httpx.AsyncClient(transport=mock) as http:
            async with AsyncPhaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
                report = await client.models.check_parameters("openai/gpt-5", {"temperature": 0.7})
                assert report["ok"]
                assert report["parameters"][0]["status"] == "supported"
        mock.assert_done()

    asyncio.run(run())


def test_async_preflight_includes_lifecycle_validation():
    async def run():
        capabilities = {
            "ok": True,
            "id": "openai/retired-model",
            "endpoints": [{
                "id": "openai:responses",
                "endpoint": "responses",
                "provider": {"id": "openai"},
                "routable": True,
                "status": "active",
                "capabilities": {"parameters": ["temperature"]},
            }],
        }
        mock = MockTransport([
            {
                "method": "GET",
                "path": "/data/models",
                "json": {"models": [{"model_id": "openai/retired-model", "status": "retired"}]},
            },
            {"method": "GET", "path": "/models/openai/retired-model/endpoints", "json": capabilities},
        ])
        async with httpx.AsyncClient(transport=mock) as http:
            async with AsyncPhaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
                report = await client.models.preflight(
                    {"model": "openai/retired-model", "input": "hello", "temperature": 0.7},
                    endpoint="responses",
                )
                assert not report["ok"]
                assert not report["lifecycle"]["ok"]
                assert report["lifecycle"]["info"]["status"] == "retired"
                assert report["parameter_support"]["ok"]
        mock.assert_done()

    asyncio.run(run())


def test_async_music_does_not_expose_collection_pagination():
    async def run():
        async with httpx.AsyncClient(transport=MockTransport([])) as http:
            async with AsyncPhaseo(api_key="test", base_url="https://example.test", http_client=http) as client:
                assert not hasattr(client.music, "pages")
                assert not hasattr(client.music, "all")
                assert hasattr(client.videos, "pages")
                assert hasattr(client.batches, "all")

    asyncio.run(run())


def test_async_image_edits_use_multipart_and_preserve_file_ownership(tmp_path):
    from email.parser import BytesParser
    from email.policy import default
    import io
    image = tmp_path / "image.png"
    image.write_bytes(b"image-bytes")
    mask = io.BytesIO(b"mask-bytes")

    def handler(request):
        assert request.method == "POST"
        assert request.url.path == "/v1/images/edits"
        content_type = request.headers["content-type"]
        assert content_type.startswith("multipart/form-data;")
        message = BytesParser(policy=default).parsebytes(
            f"Content-Type: {content_type}\r\n\r\n".encode() + request.content)
        parts = list(message.iter_parts())
        images = [part for part in parts if part.get_param("name", header="content-disposition") == "image"]
        assert [part.get_payload(decode=True) for part in images] == [b"image-bytes", b"other-bytes"]
        fields = {part.get_param("name", header="content-disposition"): part.get_payload(decode=True) for part in parts}
        assert fields["mask"] == b"mask-bytes"
        assert fields["n"] == b"2"
        assert fields["meta"] == b"false"
        assert json.loads(fields["provider"]) == {"order": ["test"]}
        return httpx.Response(200, json={"data": []})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
            client = AsyncPhaseo(api_key="test", http_client=http)
            result = await client.images.edit({"model": "test", "image": [image, b"other-bytes"],
                "mask": mask, "prompt": "Edit", "n": 2, "meta": False, "provider": {"order": ["test"]}})
            assert result == {"data": []}
        assert not mask.closed
        image.unlink()  # The SDK-owned path handle must be closed on Windows.
    try:
        asyncio.run(run())
    finally:
        mask.close()
