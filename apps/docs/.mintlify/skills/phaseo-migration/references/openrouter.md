# OpenRouter to Phaseo

For a full inventory, mapping boundary, validation and report template, use the `openrouter-to-phaseo-migration` skill. This file covers the common case.

## Detection signals

- `openrouter.ai/api/v1`, `OPENROUTER_API_KEY`, keys starting `sk-or-v1`
- `HTTP-Referer` and `X-Title` headers
- `provider` objects, `models` fallback arrays, `openrouter/auto`, `@openrouter/ai-sdk-provider`

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

Model IDs use the same `<org>/<model>` shape, but verify every one with `GET /v1/models`; do not strip prefixes or guess replacements. For the AI SDK provider, see [vercel-ai-gateway.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/vercel-ai-gateway.md).

## Feature mapping

| OpenRouter | Phaseo | Notes |
| --- | --- | --- |
| `provider.order`, `provider.only`, `provider.ignore` | Same fields | Validate provider IDs; keep at least one route available |
| `provider.sort` | `provider.sort` | `price`, `latency`, `throughput` |
| `provider.zdr` | `provider.require_zero_data_retention` | Confirm a matching provider exists first |
| `models` fallback array | `models` array | 1 to 25 entries; `model` stays the primary |
| `:nitro` suffix | `:nitro` (throughput); also `:cheap`, `:fast` | Suffix overrides request and preset routing mode |
| `openrouter/auto` | Phaseo Auto Routing | Alpha for selected workspaces; configured in the dashboard, so check the docs before relying on it |
| `HTTP-Referer`, `X-Title` | Accepted for app attribution | Add `X-App-Id` for stable grouping |
| Shared provider and parameter defaults | Presets (`"model": "@slug"`) | Move them out of call sites |
| OpenRouter-only response fields | No direct equivalent | Normalize in one compatibility layer |

## Gotchas

- Region controls (`provider.required_execution_region`, `provider.required_data_region`) have no OpenRouter counterpart; add them only if the workload needs them.
- After cutover, failed requests can be inspected and replayed from `GET /v1/generations?id=<request_id>` when `replay_supported` is true.
