# AI Stats Python SDK

Asynchronous-first Python client for AI Stats Gateway.

## Installation

```bash
pip install ai-stats-py-sdk
```

Requires Python 3.9+.

## Quick start

```python
from ai_stats import AIStats

client = AIStats()  # Uses AI_STATS_API_KEY from environment

response = client.generate_response(
    {
        "model": "google/gemma-3-27b:free",
        "input": "Reply with: python sdk quickstart works",
        "temperature": 0,
    }
)

print(response.get("output_text"))
```

## Free vs paid models

- `:free` models can be called with zero deposited credits.
- Paid models require available wallet balance.

## Streaming

```python
from ai_stats import AIStats

client = AIStats(api_key="YOUR_API_KEY")

for chunk in client.stream_text(
    {
        "model": "google/gemma-3-27b:free",
        "messages": [{"role": "user", "content": "Stream hi"}],
    }
):
    print(chunk, end="", flush=True)
```

## Model and helper methods

```python
client = AIStats()

models = client.get_models()
print(models)

client.generate_image({"model": "gpt-image-1", "prompt": "A minimal lighthouse sketch"})
client.generate_embedding({"model": "google/gemini-embedding-001", "input": "hello"})
client.generate_moderation({"model": "openai/omni-moderation", "input": "safe?"})
client.generate_video({"model": "video-alpha", "prompt": "Ocean waves"})
client.generate_speech({"model": "tts-alpha", "input": "Hello"})
client.generate_transcription({"model": "whisper-alpha", "file": "<base64 data>"})
```

## Model ID future-proofing

Model fields are typed as `KnownModelId | str`, so newly released model IDs are accepted before a package update.

## Deprecation lifecycle warnings

The SDK checks `/v1/data/models` and warns once per process for deprecated and retired models.

```python
from ai_stats import AIStats

client = AIStats(
    enable_deprecation_warnings=True,
    warnings_as_errors=False,
    logger=lambda level, message, meta: print(level, message, meta),
)

info = client.models.get_deprecation_info("openai/old-model")
validation = client.models.validate("openai/old-model")
```

## Features

- Async and sync interfaces (`AIStats` and `AIStatsSync`)
- Typed request and response models
- Streaming helper for decoded SSE frames
- Configurable timeouts, headers, and base URL
- Built-in devtools telemetry capture

## Devtools

Enable telemetry capture with `create_ai_stats_devtools()`:

```python
from ai_stats import AIStats, create_ai_stats_devtools

client = AIStats(
    devtools=create_ai_stats_devtools(
        directory=".ai-stats-devtools",
        capture_headers=False,
    )
)
```

Captured data is written to `.ai-stats-devtools/generations.jsonl`.

View with:

```bash
npx @ai-stats/devtools-viewer
```

## Release and CI

Versions are managed with Changesets and published by CI (`.github/workflows/ci.yml`).
