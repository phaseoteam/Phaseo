# OpenRouter to Phaseo

For the full field tables, mapping boundary, validation and report template, use the `openrouter-to-phaseo-migration` skill. This file covers the common case.

## Detection signals

- `openrouter.ai/api/v1`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, keys starting `sk-or-v1`
- `HTTP-Referer`, `X-Title` and `X-OpenRouter-*` headers
- `provider` objects, `models` fallback arrays, `plugins`, `transforms`, model suffixes such as `:nitro` or `:online`, `openrouter/auto`, `@preset/`
- `@openrouter/ai-sdk-provider`, `@openrouter/sdk`, `openrouter` (PyPI)

## Before and after

OpenRouter is OpenAI-compatible, so only the base URL and key change.

```ts
// Before
const client = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// After
const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

Model IDs use the same `<org>/<model>` shape and most match, but some orgs differ (`x-ai/` is `spacex-ai/`, `meta-llama/` is `meta/`, `mistralai/` is `mistral/`). Verify every ID with `GET /v1/models?format=openai`; do not guess replacements. For the AI SDK provider, swap `@openrouter/ai-sdk-provider` for `@phaseo/ai-sdk-provider` (see [vercel-ai-gateway.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/vercel-ai-gateway.md)); OpenRouter's own SDKs need a client change, not just a new base URL.

## Feature mapping

| OpenRouter | Phaseo | Notes |
| --- | --- | --- |
| `provider.order`, `only`, `ignore`, `allow_fallbacks`, `require_parameters`, `max_price` | Same fields | Use base provider IDs, not endpoint slugs |
| `provider.sort` | `provider.sort` | `price`, `latency`, `throughput` |
| `provider.zdr` | Same (alias of `provider.require_zero_data_retention`) | `data_collection: "deny"` returns 400; use `zdr: true` |
| `models` fallback array | `models` array | 1 to 25 entries; `model` is required, so move `models[0]` into it |
| `:nitro` suffix | `:nitro` (throughput); also `:cheap`, `:fast` | `:floor` becomes `:cheap`; remove `:online` and `:thinking` (use web search and `reasoning`) |
| `openrouter/auto`, `openrouter/free` | `phaseo/auto`, `phaseo/free` | `phaseo/auto` is alpha for selected workspaces and can't be combined with `models`; configure it with `phaseo routing auto update` |
| `plugins` `web`, `web-fetch`, `response-healing` | Same plugin IDs | Other plugins (`file-parser`, `context-compression`) return 400 |
| `transforms`, `usage: { include: true }` | Not accepted | Remove; usage and cost are always returned |
| `HTTP-Referer`, `X-Title` | Accepted for app attribution | Rename `X-OpenRouter-Title` to `X-Title`; add `X-App-Id` for stable grouping |
| Presets `@preset/<slug>` | Presets (`"model": "@slug"`) | Recreate them in Phaseo |
| `usage.cost`, `reasoning_details`, `provider` in responses | Returned | `native_finish_reason` and `is_byok` are not; normalize in one layer if callers read them |

## Gotchas

- Region controls (`provider.required_execution_region`, `provider.required_data_region`) have no OpenRouter counterpart; add them only if the workload needs them.
- After cutover, failed requests can be inspected and replayed from `GET /v1/generations?id=<request_id>` when `replay_supported` is true.
