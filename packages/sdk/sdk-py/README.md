# Phaseo Python SDK

Official Python SDK for Phaseo Gateway.

## Native async use

```python
import asyncio
from phaseo import AsyncPhaseo

async def main():
    async with AsyncPhaseo() as client:
        response = await client.responses.create({"model": "openai/gpt-5-nano", "input": "Hello"})
        print(response.output_text, response.request_id, response.trace_url)

asyncio.run(main())
```

The async client includes responses, chat completions, messages, images, audio,
embeddings, OCR, rerank, parse, moderations, decisions, models, files, music, video
and batches. Use `request(method, path, ...)` for additional HTTP operations.
`async for event in client.responses.stream(request)` streams parsed events.
`collect_async_stream(events)` collects text and usage. Standard asyncio task
cancellation interrupts HTTP and polling. Close clients with `async with` or
`await close()`. Injected HTTPX clients remain caller-owned.

Both clients expose immutable `with_options(timeout=30, max_retries=2)` controls.
HTTPX timeouts are in seconds and bound network inactivity. Retries default to
zero and apply only to GET/HEAD before response consumption; submissions are
never retried. `PhaseoHTTPError` preserves the response, body, status, `code`,
`request_id`, `trace_url` and `retry_after` in seconds. JSON objects remain
dictionaries, with typed metadata and an `output_text` property.

Python's HTTP timeout is not a total transfer deadline: an active stream can
continue while chunks arrive. TypeScript's `timeoutMs` is a total HTTP deadline.
Job waiting timeouts in both SDKs bound the overall polling workflow separately.

Migration: synchronous JSON requests now use HTTPX. Replace catches of
`urllib.error.HTTPError` with `PhaseoHTTPError` (or `httpx.HTTPStatusError`). Use
`error.status` for the HTTP status and `error.code` for the API error code.
Catch `httpx.TransportError` for connection failures.

## Workflow helpers

- Music, videos and batches support `start(request)` and `resume(id)`. A handle
  exposes `id`, `result()`, `events()` and `to_dict()`. Persist its kind and ID to
  resume later. Await async handle methods and use `async for` for events.
  Remote cancellation is available only for video and batch.
- `videos.stream_content(id)` streams bytes. The sync `download_to(chunks, file)`
  helper writes to a caller-owned binary file. Uploads accept bytes, `Path`
  objects, open files or HTTPX file tuples through `files.create`.
- Sync `batches.results(id)` and async `batches.results(id)` incrementally parse
  JSONL. Match by `custom_id`; a completed batch can contain failed rows.
- `parse_output(response, PydanticModel)` or `responses.parse(request, model)`
  validates completed output. Configure server structured output explicitly;
  validation never resubmits. `check_model_capabilities(id, input_types=...,
  output_types=..., endpoints=..., parameters=..., parameter_values=...)` checks
  advertised metadata across a single available provider offer. Unknown facts
  fail preflight; the helper never changes the request or guarantees execution.

## Local application tests

```python
import httpx
from phaseo import Phaseo
from phaseo.testing import MockTransport

mock = MockTransport([
    {"method": "GET", "path": "/v1/videos/v1", "json": {"id": "v1", "status": "completed"}},
])
with httpx.Client(transport=mock) as http:
    with Phaseo(api_key="test", http_client=http) as client:
        assert client.videos.resume("v1").result()["status"] == "completed"
mock.assert_done()
```

Use the same transport with `httpx.AsyncClient` and `AsyncPhaseo`. Unexpected
requests fail locally with no network fallback. Include catalogue lookups when
testing sync generation methods that perform lifecycle validation. Fixtures
verify application behavior, not live provider compatibility.

## Installation

```bash
pip install phaseo
```

Requires Python 3.10+.

## Quick start

```python
from phaseo import Phaseo

client = Phaseo()  # Uses PHASEO_API_KEY from environment

response = client.responses.create(
    {
        "model": "google/gemma-3-27b:free",
        "input": "Reply with: Python SDK works",
    }
)

print(response.get("output_text"))
```

To attribute usage to one of your own applications, provide app metadata explicitly:

```python
client = Phaseo(
    app={
        "id": "support-console",
        "name": "Support Console",
        "url": "https://support.example.com",
    }
)
```

App attribution is optional and is never inferred from the SDK itself.

## Regional text routing

Select `eu` or `us` to restrict Chat Completions, Responses, and Messages to
matching regional provider routes:

```python
client = Phaseo(region="eu")
```

Regional endpoints currently accept text-only requests. This is regional
provider routing, not an end-to-end data residency guarantee. `region` cannot be
combined with a custom `base_url`.

## Waiting for music, video, and batches

Submit once and wait for completion using the synchronous Python client:

```python
import os

music = client.music.generate_and_wait(
    {"model": os.environ["PHASEO_MUSIC_MODEL"], "prompt": "Gentle instrumental piano"},
    timeout=600,
    interval=5,
    on_poll=lambda job: print(job["id"], job["status"]),
)
```

| Resource | Submit and wait for success | Wait for an existing job |
| --- | --- | --- |
| Music | `music.generate_and_wait(request, **options)` | `music.wait(id, **options)` |
| Video | `videos.generate_and_wait(request, **options)` | `videos.wait(id, **options)` |
| Batch | `batches.create_and_wait(request, **options)` | `batches.wait(id, **options)` |

Top-level equivalents are `generate_music_and_wait`, `generate_video_and_wait`, `create_batch_and_wait`, `wait_for_music`, `wait_for_video`, and `wait_for_batch`. Music also has direct `music.create(request)` and `music.retrieve(id)` methods.

All helpers return the full response. Submit-and-wait raises `JobFailedError` for failed, cancelled, or expired jobs, retaining the payload in `error.response`. Wait-by-ID returns any terminal response for inspection. Completed batches may include failed individual requests; inspect `request_counts` and the output/error files.

Options are `interval` (seconds; default 5, minimum 0.25), `timeout` (seconds; default 1800), `on_poll`, and `cancel_event` (a `threading.Event`). Callbacks receive the initial response and every retrieved snapshot. The waiting timeout begins after submission returns. The synchronous client checks timeout and cancellation between HTTP calls and callbacks; these options do not interrupt an HTTP call already in progress or impose a transport timeout.

`JobTimeoutError` and `JobCancelledError` expose `job_id` and `last_response`; resume with `.wait(error.job_id)`. Setting the cancellation event stops local waiting without cancelling the remote job. Submissions are never automatically retried. These helpers consume the existing gateway API; they do not make synchronous provider submission durable in the background.

## Streaming example

```python
from phaseo import Phaseo

client = Phaseo()

response = ""
for chunk in client.stream_chat(
    {
        "model": "google/gemma-3-27b:free",
        "messages": [{"role": "user", "content": "Stream hi"}],
    }
):
    if chunk.get("text"):
        response += chunk["text"]
        print(chunk["text"], end="", flush=True)

    if chunk.get("reasoning_tokens"):
        print("\nReasoning tokens:", chunk["reasoning_tokens"])
```

## Common methods

- `client.responses.create(...)`
- `client.chat.completions.create(...)`
- `client.messages.create(...)`
- `client.stream_chat(...)`, `client.stream_responses(...)`, and `client.stream_message(...)` for parsed streaming chunks with `text`, `usage`, and `reasoning_tokens`
- `client.models.list(...)`
- `client.list_organisations(...)` for paginated `/organisations` discovery
- `client.list_pricing_models(...)` for `/pricing/models` catalogue pricing discovery
- `client.calculate_pricing(...)` for `/pricing/calculate` usage estimation
- `client.list_providers(...)`, `client.get_credits(...)`, `client.get_activity(...)`, and `client.get_analytics(...)` for provider discovery and management-key usage surfaces
- `client.list_api_keys(...)` for management-key `/keys` discovery
- `client.create_api_key(...)`, `client.update_api_key(key_id, ...)`, and `client.delete_api_key(key_id)` for management-key API-key lifecycle changes
- `client.get_api_key(key_id)` for management-key `/keys/{id}` lookup
- `client.list_workspaces(...)`, `client.get_workspace(workspace_id)`, `client.create_workspace(...)`, `client.update_workspace(workspace_id, ...)`, and `client.delete_workspace(workspace_id)` for management-key workspace lifecycle management
- `client.get_current_api_key()`
- `client.get_health()`
- `client.models.get_deprecation_info(model_id)`
- `client.models.validate(model_id)`
- `client.batches.list_models()` for batch-capable models and supported batch parameter metadata

Model discovery supports the public `/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

Use `provider_availability_reason` with `availability="all"` when you want rollout-state entries such as `preview_only`, `provider_not_ready`, `gated`, `access_limited`, `region_limited`, `project_limited`, `paused`, or `soft_blocked`. Use `capability_status` with `availability="all"` when you want non-routable endpoint mappings such as `coming_soon` or `internal_testing`.

```python
models = client.get_models({
    "provider": ["anthropic"],
    "provider_status": ["beta", "not_ready"],
    "provider_availability_reason": ["preview_only", "provider_not_ready"],
    "capability_status": ["coming_soon", "internal_testing"],
    "availability": "all",
})
```

## Async job websocket helpers

Batch and video operations can expose a websocket lifecycle stream at `/v1/async/{kind}/{id}/ws`.
Create responses include the job id, polling URL, optional websocket URL, and sanitized webhook delivery state.

```python
import os

batch = client.batches.create({
    "endpoint": "/v1/responses",
    "input_file_id": "file_123",
    "completion_window": "24h",
    "webhook": {
        "url": "https://example.com/phaseo/webhooks",
        "secret": os.environ["PHASEO_WEBHOOK_SECRET"],
        "events": ["batch.progress", "batch.completed", "batch.failed"],
    },
})

video = client.videos.create({
    "model": "google/veo-3",
    "prompt": "orbital reveal",
    "webhook": {
        "url": "https://example.com/phaseo/webhooks",
        "secret": os.environ["PHASEO_WEBHOOK_SECRET"],
        "events": ["video.progress", "video.completed", "video.failed"],
    },
})
```

```python
batch_socket_url = client.batches.websocket_url("batch_123", interval_ms=1500)

video_socket_url = client.videos.websocket_url(
    "video_123",
    close_on_terminal=True,
)

generic_socket_url = client.get_async_job_websocket_url("video", "video_123")
```

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Model lifecycle warnings

```python
from phaseo import Phaseo

client = Phaseo(
    enable_deprecation_warnings=True,
    warnings_as_errors=False,
    logger=lambda level, message, meta: print(level, message, meta),
)
```

For completed Anthropic batches, `client.batches.stream_results(batch_id)` yields original JSONL byte chunks without buffering the whole download. Write chunks to your output file and close the iterator if stopping early. The configured HTTP timeout applies; downloading does not add inference charges.

## Environment variables

- `PHASEO_API_KEY` (required unless passed in code)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Devtools

```python
from phaseo import Phaseo, create_phaseo_devtools

client = Phaseo(
    devtools=create_phaseo_devtools(
        directory=".phaseo-devtools",
        capture_headers=False,
    )
)
```

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:py`
- Run tests: `pnpm test:sdk-py`
- Smoke checks:
  - `pnpm --filter @phaseo/py-sdk run smoke:chat`
  - `pnpm --filter @phaseo/py-sdk run smoke:responses`
