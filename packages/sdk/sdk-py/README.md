# AI Stats Python SDK

Official Python SDK for AI Stats Gateway.

## Installation

```bash
pip install ai-stats-py-sdk
```

Requires Python 3.10+.

## Quick start

```python
from ai_stats import AIStats

client = AIStats()  # Uses AI_STATS_API_KEY from environment

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
from ai_stats import AIStats

client = AIStats()

for chunk in client.stream_text(
    {
        "model": "google/gemma-3-27b:free",
        "messages": [{"role": "user", "content": "Stream hi"}],
    }
):
    print(chunk, end="", flush=True)
```

## Common methods

- `client.responses.create(...)`
- `client.chat.completions.create(...)`
- `client.models.list(...)`
- `client.models.get_deprecation_info(model_id)`
- `client.models.validate(model_id)`

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Model lifecycle warnings

```python
from ai_stats import AIStats

client = AIStats(
    enable_deprecation_warnings=True,
    warnings_as_errors=False,
    logger=lambda level, message, meta: print(level, message, meta),
)
```

## Environment variables

- `AI_STATS_API_KEY` (required unless passed in code)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Devtools

```python
from ai_stats import AIStats, create_ai_stats_devtools

client = AIStats(
    devtools=create_ai_stats_devtools(
        directory=".ai-stats-devtools",
        capture_headers=False,
    )
)
```

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:py`
- Run tests: `pnpm test:sdk-py`
- Smoke checks:
  - `pnpm --filter @ai-stats/py-sdk run smoke:chat`
  - `pnpm --filter @ai-stats/py-sdk run smoke:responses`
