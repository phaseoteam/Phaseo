# LiteLLM to Phaseo

LiteLLM appears in two forms: a proxy server that applications call over HTTP, and the `litellm` Python SDK called in-process. Pick the path the user wants:

- **Replace the proxy**: point applications at Phaseo directly and move proxy config into Phaseo.
- **Keep LiteLLM, route through Phaseo**: leave LiteLLM in place and make Phaseo its upstream.

## Detection signals

- `config.yaml` / `litellm_config.yaml` with `model_list`, `litellm_params`, `router_settings`, `litellm_settings`
- An OpenAI-compatible client whose base URL is the proxy (often `http://localhost:4000` or an internal hostname)
- `LITELLM_MASTER_KEY`, other `LITELLM_*` variables, proxy virtual keys
- `from litellm import completion`, `litellm.Router`, the `litellm` Docker image

## Before and after: replace the proxy

```ts
// Before
const client = new OpenAI({
  apiKey: process.env.LITELLM_API_KEY,
  baseURL: process.env.LITELLM_BASE_URL,
});

// After
const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

Each `model_name` alias the app sends must become a Phaseo model ID from `GET /v1/models`, a preset (`"model": "@slug"`), or an entry in one mapping function at the client boundary.

## Before and after: keep LiteLLM

LiteLLM's `openai/` prefix means "OpenAI-compatible endpoint", so the string becomes `openai/<phaseo model ID>`.

```yaml
model_list:
  - model_name: phaseo-free
    litellm_params:
      model: openai/phaseo/free
      api_key: os.environ/PHASEO_API_KEY
      api_base: https://api.phaseo.app/v1
```

```python
import os
from litellm import completion

PHASEO_MODEL_ID = "phaseo/free"

response = completion(
    model=f"openai/{PHASEO_MODEL_ID}",
    api_key=os.environ["PHASEO_API_KEY"],
    api_base="https://api.phaseo.app/v1",
    messages=[{"role": "user", "content": "Reply with: ok"}],
)
```

## Feature mapping (replacing the proxy)

| LiteLLM | Phaseo | Notes |
| --- | --- | --- |
| `model_list` aliases | Phaseo model IDs, presets, or one boundary map | Every alias needs an explicit mapping |
| `router_settings` fallbacks | `models` array or dynamic route fallbacks | Fallback triggers are 429 and 5xx |
| `routing_strategy` | Workspace routing mode or `provider.sort` | `balanced`, `price`, `latency`, `throughput` |
| Per-deployment provider choice | `provider.order` / `provider.only` / `provider.ignore` | Or a provider-qualified ID such as `provider:org/model` (no cross-provider fallback) |
| Self-hosted or dedicated deployments (vLLM and similar) | Private Models | Needs a public HTTPS OpenAI-compatible `/chat/completions` endpoint with bearer auth |
| Response cache (`litellm_settings.cache`) | Preset-level response caching | Keep request shapes stable so the cache key matches |
| Virtual keys, `max_budget`, `rpm` | Phaseo API keys with limits, budgets and rate limit policies | `tokens_per_minute` and concurrency limits are not enforced yet |
| Callbacks (`success_callback`, Langfuse, OpenTelemetry) | Observability destinations (webhook or OpenTelemetry) or client-side tracing | Decide which system is the record for cost |
| Provider API keys in config | BYOK in the dashboard, or managed Phaseo credits | BYOK can optionally fall back to Phaseo credits |

## Gotchas

- Inventory callbacks, budgets and retries before removing the proxy; they stop silently when it goes away.
- Some proxy layers drop unknown tool types. If you keep LiteLLM in front, test Phaseo server tools through it.
- Decide whether LiteLLM, Phaseo or both is the system of record for spend.
