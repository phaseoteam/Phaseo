# AI Stats Python SDK

Asynchronous-first Python client for the AI Stats Gateway API. Built from the canonical OpenAPI spec and wrapped with helper methods that mirror the new generate/stream interface.

## Installation

```bash
pip install ai-stats-py-sdk
```

Requires Python 3.9+.

## Quick start

```python
import asyncio
from ai_stats import AIStats

async def main():
    client = AIStats(api_key="sk_test_xxx")
    async with client:
        completion = await client.generate_text(
            {"model": "openai/gpt-5-nano", "messages": [{"role": "user", "content": "Say hi"}]}
        )
        print(completion.choices[0].message.content)

asyncio.run(main())
```

### Streaming

```python
async with AIStats(api_key="...") as client:
    async for chunk in client.stream_text(
        {"model": "openai/gpt-5-nano", "messages": [{"role": "user", "content": "Stream hi"}]}
    ):
        print(chunk, end="", flush=True)
```

### Models and other helpers

```python
async with AIStats(api_key="...") as client:
    models = await client.get_models()
    print([m.id for m in models.data])

    await client.generate_image({"model": "image-alpha", "prompt": "A purple nebula"})
    await client.generate_embedding({"model": "google/gemini-embedding-001", "input": "hello"})
    await client.generate_moderation({"model": "openai/omni-moderation", "input": "safe?"})
    await client.generate_video({"model": "video-alpha", "prompt": "Ocean waves"})
    await client.generate_speech({"model": "tts-alpha", "input": "Hello!"})
    await client.generate_transcription({"model": "whisper-alpha", "file": "<base64 data>"})
```

## Features

- Async and sync interfaces (`AIStats` + `AIStatsSync`)
- Typed models for requests/responses and errors
- Streaming helper that yields decoded SSE frames
- Customisable timeouts, headers, and base URL

Note: Provide the API key explicitly via the `api_key` parameter or by adding an `Authorization` header through `headers`. The SDK does not read environment variables.

Refer to the docstrings for each method to see accepted parameters and return values—everything is annotated for IntelliSense.

Versions are driven by Changesets and published via CI (see `.github/workflows/ci.yml`). You should not need to tag or upload artifacts manually.
