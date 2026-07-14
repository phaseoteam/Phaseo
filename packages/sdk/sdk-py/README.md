# Phaseo Python SDK

Official Python SDK for Phaseo Gateway.

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
