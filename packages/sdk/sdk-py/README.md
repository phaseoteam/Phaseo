# AI Stats Python SDK

Asynchronous-first Python client for the AI Stats Gateway API. Built from the canonical OpenAPI spec and wrapped with helper methods that mirror the new generate/stream interface.

## Installation

```bash
pip install ai-stats-py-sdk
```

Requires Python 3.9+.

## Quick start

```python
from ai_stats import AIStats

# Uses AI_STATS_API_KEY from environment by default.
client = AIStats()
response = client.generate_response(
    {"model": "openai/gpt-5.4", "input": "Write a one-sentence bedtime story about a unicorn."}
)
print(response.get("output_text"))
```

### Streaming

```python
client = AIStats(api_key="sk_test_xxx")
for chunk in client.stream_text(
    {"model": "openai/gpt-5.4", "messages": [{"role": "user", "content": "Stream hi"}]}
):
    print(chunk, end="", flush=True)
```

### Models and other helpers

```python
client = AIStats()
models = client.get_models()
print(models)

client.generate_image({"model": "image-alpha", "prompt": "A purple nebula"})
client.generate_embedding({"model": "google/gemini-embedding-001", "input": "hello"})
client.generate_moderation({"model": "openai/omni-moderation", "input": "safe?"})
client.generate_video({"model": "video-alpha", "prompt": "Ocean waves"})
client.generate_speech({"model": "tts-alpha", "input": "Hello!"})
client.generate_transcription({"model": "whisper-alpha", "file": "<base64 data>"})
```

### Model ID future-proofing

Model fields are typed as `KnownModelId | str`, so new gateway model IDs are still accepted before a package update.

### Deprecation lifecycle warnings

The SDK checks `/v1/data/models` and warns once per process for deprecated/retired models.

```python
from ai_stats import AIStats

client = AIStats(
    enable_deprecation_warnings=True,  # default
    warnings_as_errors=False,          # set True to raise instead of warn
    logger=lambda level, message, meta: print(level, message, meta),
)

info = client.models.get_deprecation_info("openai/old-model")
validation = client.models.validate("openai/old-model")
```

## Features

- Async and sync interfaces (`AIStats` + `AIStatsSync`)
- Typed models for requests/responses and errors
- Streaming helper that yields decoded SSE frames
- Customisable timeouts, headers, and base URL
- Built-in devtools telemetry capture (no separate core package required)

## Devtools

The Python SDK bundles telemetry capture directly. Enable it by passing
`create_ai_stats_devtools()` to the client:

```python
from ai_stats import AIStats, create_ai_stats_devtools

client = AIStats(
    devtools=create_ai_stats_devtools(
        directory=".ai-stats-devtools",
        capture_headers=False,
    ),
)
```

Captured data is written to `.ai-stats-devtools/generations.jsonl` and can be
viewed with:

```bash
npx @ai-stats/devtools-viewer
```

Note: The client reads `AI_STATS_API_KEY` by default. You can still pass `api_key` explicitly.

Refer to the docstrings for each method to see accepted parameters and return values—everything is annotated for IntelliSense.

Versions are driven by Changesets and published via CI (see `.github/workflows/ci.yml`). You should not need to tag or upload artifacts manually.
