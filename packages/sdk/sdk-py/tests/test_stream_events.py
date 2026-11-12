import asyncio
import json
import re
from pathlib import Path

import httpx

import phaseo
from phaseo import AsyncPhaseo, Phaseo

ANSWER = "Paris is the capital of France."
PACKAGE_ROOT = Path(__file__).resolve().parents[1]


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


# Shape of a gateway /responses stream: named events, deltas, then done events that repeat the text.
RESPONSES_STREAM = "".join([
    _sse("response.created", {"type": "response.created", "sequence_number": 0, "response": {"id": "resp_1", "status": "in_progress", "output": []}}),
    _sse("response.output_item.added", {"type": "response.output_item.added", "sequence_number": 1, "output_index": 0, "item": {"id": "msg_1", "type": "message", "role": "assistant", "content": []}}),
    _sse("response.content_part.added", {"type": "response.content_part.added", "sequence_number": 2, "item_id": "msg_1", "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": ""}}),
    _sse("response.output_text.delta", {"type": "response.output_text.delta", "sequence_number": 3, "item_id": "msg_1", "output_index": 0, "content_index": 0, "delta": "Paris is"}),
    _sse("response.output_text.delta", {"type": "response.output_text.delta", "sequence_number": 4, "item_id": "msg_1", "output_index": 0, "content_index": 0, "delta": " the capital of France."}),
    _sse("response.output_text.done", {"type": "response.output_text.done", "sequence_number": 5, "item_id": "msg_1", "output_index": 0, "content_index": 0, "text": ANSWER}),
    _sse("response.content_part.done", {"type": "response.content_part.done", "sequence_number": 6, "item_id": "msg_1", "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": ANSWER}}),
    _sse("response.output_item.done", {"type": "response.output_item.done", "sequence_number": 7, "output_index": 0, "item": {"id": "msg_1", "type": "message", "role": "assistant", "content": [{"type": "output_text", "text": ANSWER}]}}),
    _sse("response.completed", {"type": "response.completed", "sequence_number": 8, "response": {"id": "resp_1", "status": "completed", "output_text": ANSWER, "usage": {"input_tokens": 12, "output_tokens": 8, "output_tokens_details": {"reasoning_tokens": 0}}}}),
    "data: [DONE]\n\n",
])


def _sse_handler(path: str, body: str):
    def handle(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path == path:
            return httpx.Response(200, headers={"Content-Type": "text/event-stream"}, content=body.encode())
        # Model lifecycle lookups are not part of these tests.
        return httpx.Response(404, json={})

    return handle


_responses_handler = _sse_handler("/v1/responses", RESPONSES_STREAM)


def _sync_client(handler=_responses_handler) -> Phaseo:
    http = httpx.Client(transport=httpx.MockTransport(handler))
    return Phaseo(api_key="sk_test_123", base_url="https://example.test/v1", http_client=http)


def test_streamed_text_contains_the_answer_once():
    chunks = list(_sync_client().stream_responses({"model": "openai/gpt-5-nano", "input": "Capital of France?"}))

    assert "".join(chunk["text"] for chunk in chunks) == ANSWER
    # `event:` lines name the next payload; they are never yielded as chunks of their own.
    assert all("raw" not in chunk for chunk in chunks)
    assert [chunk["type"] for chunk in chunks] == [
        "response.created",
        "response.output_item.added",
        "response.content_part.added",
        "response.output_text.delta",
        "response.output_text.delta",
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.completed",
    ]


def test_done_event_keeps_full_text_off_the_text_field():
    chunks = list(_sync_client().stream_responses({"model": "openai/gpt-5-nano", "input": "Capital of France?"}))
    done = next(chunk for chunk in chunks if chunk["type"] == "response.output_text.done")
    completed = chunks[-1]

    assert done["text"] == ""
    assert done["full_text"] == ANSWER
    assert completed["text"] == ""
    assert completed["response"]["output_text"] == ANSWER
    assert completed["usage"]["output_tokens"] == 8


def test_documented_print_loop_prints_the_answer_once(capsys):
    for chunk in _sync_client().stream_responses({"model": "openai/gpt-5-nano", "input": "Capital of France?"}):
        if chunk["text"]:
            print(chunk["text"], end="", flush=True)

    assert capsys.readouterr().out == ANSWER


def test_event_line_names_untyped_data():
    stream = "event: response.output_text.delta\ndata: {\"delta\":\"Hi\"}\n\nevent: response.output_text.done\ndata: {\"text\":\"Hi\"}\n\n"
    client = _sync_client(_sse_handler("/v1/responses", stream))

    chunks = list(client.stream_responses({"model": "openai/gpt-5-nano", "input": "hi"}))

    assert [(chunk["type"], chunk["text"]) for chunk in chunks] == [
        ("response.output_text.delta", "Hi"),
        ("response.output_text.done", ""),
    ]
    assert chunks[1]["full_text"] == "Hi"


def test_async_stream_contains_the_answer_once():
    async def run() -> list[dict]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(_responses_handler)) as http:
            client = AsyncPhaseo(api_key="sk_test_123", base_url="https://example.test/v1", http_client=http)
            return [chunk async for chunk in client.responses.stream({"model": "openai/gpt-5-nano", "input": "Capital of France?"})]

    chunks = asyncio.run(run())

    assert "".join(chunk["text"] for chunk in chunks) == ANSWER
    assert all("raw" not in chunk for chunk in chunks)
    assert chunks[5]["full_text"] == ANSWER


def test_message_stream_skips_event_lines():
    stream = "".join([
        _sse("message_start", {"type": "message_start", "message": {"id": "msg_1", "usage": {"input_tokens": 3}}}),
        _sse("content_block_delta", {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "Hi"}}),
        _sse("message_stop", {"type": "message_stop"}),
    ])
    client = _sync_client(_sse_handler("/v1/messages", stream))

    chunks = list(client.stream_message({"model": "anthropic/claude-sonnet-4.5", "max_tokens": 8, "messages": []}))

    assert [chunk["type"] for chunk in chunks] == ["message_start", "content_block_delta", "message_stop"]
    assert "".join(chunk["text"] for chunk in chunks) == "Hi"


def test_client_version_headers_match_the_package_version():
    pyproject_version = re.search(r'^version\s*=\s*"([^"]+)"', (PACKAGE_ROOT / "pyproject.toml").read_text(encoding="utf-8"), re.M)
    package_version = json.loads((PACKAGE_ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    assert pyproject_version is not None
    assert phaseo.__version__ == pyproject_version.group(1) == package_version

    sync_headers = Phaseo(api_key="sk_test_123")._headers
    async_headers = AsyncPhaseo(api_key="sk_test_123").headers
    for headers in (sync_headers, async_headers):
        assert headers["X-Phaseo-Client-Version"] == phaseo.__version__
        assert headers["User-Agent"] == f"phaseo-python/{phaseo.__version__}"
