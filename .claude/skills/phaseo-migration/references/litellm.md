# LiteLLM to Phaseo

LiteLLM appears in two forms: a proxy server that applications call over HTTP, and the `litellm` Python SDK called in-process. Pick the path the user wants:

- **Replace the proxy**: point applications at Phaseo directly and move proxy config into Phaseo.
- **Keep LiteLLM, route through Phaseo**: leave LiteLLM in place and make Phaseo its upstream.

## Detection signals

- `config.yaml` / `litellm_config.yaml` with `model_list`, `litellm_params`, `router_settings`, `litellm_settings`
- An OpenAI-compatible client whose base URL is the proxy (often `http://localhost:4000` or an internal hostname)
- `LITELLM_MASTER_KEY`, other `LITELLM_*` variables (`LITELLM_PROXY_API_BASE`, `LITELLM_PROXY_API_KEY`, `USE_LITELLM_PROXY`), proxy virtual keys
- `from litellm import completion`, `litellm.Router`, `litellm_proxy/` model prefixes, the `litellm` Docker image

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

Each `model_name` alias the app sends must become a Phaseo model ID from `GET /v1/models?format=openai`, a preset (`"model": "@slug"`), or an entry in one mapping function at the client boundary.

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
| `fallbacks` (under `router_settings` or `litellm_settings`) | `models` array or dynamic route fallbacks | Triggers on 429, 500, 502, 503 and 504, never on request errors |
| `context_window_fallbacks`, `content_policy_fallbacks` | No equivalent | Phaseo never falls back on a 400; handle these in the app |
| `routing_strategy` | Workspace routing mode or `provider.sort` | `balanced`, `price`, `latency`, `throughput` |
| Per-deployment provider choice | `provider.order` / `provider.only` / `provider.ignore` | Or a provider-qualified ID such as `provider:org/model` (no cross-provider fallback) |
| Self-hosted or dedicated deployments (vLLM and similar) | Private Models | Needs a public HTTPS OpenAI-compatible `/chat/completions` endpoint with bearer auth |
| Response cache (`litellm_settings.cache`) | No equivalent yet | Phaseo does not cache responses; cache in the app if needed. Prompt caching (`cache_control`) still cuts input cost |
| Virtual keys (`max_budget`, `budget_duration`, `rpm_limit`, `tpm_limit`, `max_parallel_requests`, `models`) | API keys with spend limits and allowed models, budgets, rate limit policies | Policies enforce requests per minute, tokens per minute and concurrent requests |
| Team budgets, `metadata.tags` spend tracking | Department budgets, `X-Phaseo-Metadata` labels | End-user budgets map only to an end-user rate limit policy; there is no end-user spend cap |
| `guardrails` (Presidio, Lakera and similar) | Key guardrails: prompt injection and PII on requests | Responses are not scanned; see `phaseo-guardrails` |
| Callbacks (`success_callback`, Langfuse, Datadog, OpenTelemetry) | Observability destinations (Langfuse, LangSmith, Datadog, PostHog, any OTLP collector, a webhook, row exports to S3 or BigQuery) or client-side tracing | Body `metadata` exports as `phaseo.metadata.<key>`; decide which system is the record for cost |
| Provider API keys in config | BYOK (`phaseo byok create --provider <id> --name <name> --key-stdin` or `POST /v1/byok`), or managed Phaseo credits | BYOK can fall back to Phaseo credits: set `byok_fallback_enabled` with `phaseo settings update` or `PATCH /v1/settings` |

## Gotchas

- Inventory callbacks, budgets and retries before removing the proxy; they stop silently when it goes away.
- Some proxy layers drop unknown tool types. If you keep LiteLLM in front, test Phaseo server tools through it.
- Decide whether LiteLLM, Phaseo or both is the system of record for spend.
- A proxy sends a whole team's traffic through one key owner, so it shares that user's requests-per-minute allowance (10 for a new workspace). Check the limits page and arrange a higher limit before cutover.
