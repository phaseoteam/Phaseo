# OpenRouter to Phaseo Playbook

## Contents
- Quick diff targets
- Search patterns
- Field mapping (works unchanged, rewrite, fails on Phaseo)
- Model IDs, suffixes and routers
- Account endpoints
- Mapping boundary
- REST template
- Validation commands
- Migration report format

## Quick Diff Targets
- Base URL: `https://openrouter.ai/api/v1` → `https://api.phaseo.app/v1`
- API key env: `OPENROUTER_API_KEY` → `PHASEO_API_KEY` (remove `OPENROUTER_BASE_URL`)
- Attribution headers: keep `HTTP-Referer` and `X-Title`; `X-OpenRouter-Title` → `X-Title`, `X-OpenRouter-Categories` → `X-App-Categories`, drop `X-OpenRouter-App-Visibility`; add `X-App-Id`
- AI SDK: `@openrouter/ai-sdk-provider` → `@phaseo/ai-sdk-provider` (`createOpenRouter` → `createPhaseo`, `providerOptions.openrouter` → `providerOptions.phaseo`)

## Search Patterns
- `openrouter.ai`, `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `sk-or-v1`
- `X-Title`, `HTTP-Referer`, `X-OpenRouter-`
- `@openrouter/ai-sdk-provider`, `@openrouter/sdk`, `from openrouter import`
- `"x-ai/`, `"meta-llama/`, `"mistralai/`, `"~`, `"openrouter/`, `@preset/`
- `:free"`, `:nitro"`, `:floor"`, `:online"`, `:thinking"`, `:exacto"`
- `provider:`, `models:`, `plugins`, `transforms`, `usage: { include`
- `/api/v1/generation`, `/api/v1/credits`, `/api/v1/key`

## Field Mapping

### Works unchanged
| OpenRouter | Phaseo |
| --- | --- |
| `provider.order`, `only`, `ignore` | Same fields; use base provider IDs |
| `provider.sort` (`price`, `latency`, `throughput`, or `{ by }`) | Same |
| `provider.allow_fallbacks`, `require_parameters`, `quantizations`, `max_price` | Same |
| `provider.preferred_min_throughput`, `preferred_max_latency` | Same |
| `provider.zdr` | Same (alias of `require_zero_data_retention`) |
| `models` fallback array | 1 to 25 entries, tried on 429, 500, 502, 503, 504 |
| `route: "fallback"` | Accepted |
| `reasoning` (`effort`, `max_tokens`, `enabled`) | Same |
| `plugins: [{ id: "web" }]`, `web-fetch`, `response-healing` | Same plugin IDs; `response-healing` is non-streaming only |
| `HTTP-Referer`, `X-Title` | Same; add `X-App-Id` for stable grouping |
| Structured outputs, tools, streaming | Same request shapes |

### Rewrite
| OpenRouter | Phaseo |
| --- | --- |
| `models` without `model` | Move `models[0]` into `model` (400 `model_required_with_models` otherwise) |
| `X-OpenRouter-Title`, `X-OpenRouter-Categories` | `X-Title`, `X-App-Categories` |
| `{ type: "openrouter:web_search" }` tool | `{ type: "phaseo:web_search" }` |
| `:online` suffix | Remove; add `plugins: [{ id: "web" }]` or the `phaseo:web_search` tool |
| `:thinking` suffix | Remove; set `reasoning` |
| `:floor` suffix | `:cheap` |
| `@preset/<slug>` | `@<slug>`, after creating the preset in Phaseo |
| `openrouter/auto` | `phaseo/auto` (alpha; not with `models`); its `allowed_models` become `allowed_patterns` via `phaseo routing auto update` |
| `openrouter/free` | `phaseo/free` |
| `provider.data_collection: "deny"` | `provider.zdr: true` |

### Fails on Phaseo
Remove these before cutover; each returns a 400 or is silently ignored.

| OpenRouter | Phaseo result | Instead |
| --- | --- | --- |
| `provider.data_collection: "deny"`, `enforce_distillable_text: true` | 400 `unsupported_routing_filter` | `provider.zdr: true` |
| Provider endpoint slugs (`deepinfra/turbo`, `google-vertex/us-east5`) | Not matched | Base provider IDs; `provider.required_execution_region` for regions |
| `plugins` with `file-parser`, `context-compression`, `auto-router` | 400 `unknown_gateway_plugin`, even with `enabled: false` | Send document content directly; trim context client-side |
| `transforms: ["middle-out"]`, the `preset` body field | 400 unknown parameter | Trim context client-side; `"model": "@slug"` |
| `usage: { include: true }` | 400; `usage` must be a boolean | Delete it; usage and cost are always returned |
| `reasoning.exclude` | Ignored; reasoning is still returned | Drop reasoning fields in the client |
| `model@preset/<slug>` | Unsupported | `"model": "@slug"` with the model set in the preset |
| `:exacto` and other unknown suffixes | Model lookup fails | Remove the suffix |
| `~org/model-latest` aliases | No equivalent | Pin a current ID |

### Response fields
Returned: `usage.cost`, `usage.cost_details.upstream_inference_cost`, `message.reasoning`, `reasoning_details`, `message.images`, top-level `provider`. Not returned: `native_finish_reason`, `is_byok`, the split `upstream_inference_prompt_cost` / `upstream_inference_completions_cost`. Normalize only the ones callers read.

## Model IDs, Suffixes and Routers
- Same `<org>/<model>` shape; most IDs match exactly.
- Known org differences: `x-ai/` → `spacex-ai/`, `meta-llama/` → `meta/`, `mistralai/` → `mistral/`. Version spelling can differ (`-4-0` vs `-4`).
- Phaseo strips `:nitro` (throughput), `:cheap` (price) and `:fast` before lookup; a suffix overrides request and preset routing. Any other suffix stays in the ID and the lookup fails.
- `:free` variants: check that the exact ID is in `GET /v1/models?format=openai`, or use `phaseo/free`.

## Account Endpoints
| OpenRouter | Phaseo | Notes |
| --- | --- | --- |
| `GET /api/v1/generation?id=` | `GET /v1/generations?id=<request_id>` | Different response shape; includes `replay_supported` |
| `GET /api/v1/credits` | `GET /v1/credits` | Amounts are in nanodollars, not USD |
| `GET /api/v1/key` | `GET /v1/key` | |
| BYOK in the dashboard | `/v1/byok` or `phaseo byok create` | Workspace-level keys |
| `GET /api/v1/models` | `GET /v1/models?format=openai` | Without `format=openai` the list is Phaseo's paged shape |

## Mapping Boundary
Use a single mapper so callers keep current model names while the migration is in progress.

```ts
const ORG_RENAMES: Record<string, string> = {
  "x-ai/": "spacex-ai/",
  "meta-llama/": "meta/",
  "mistralai/": "mistral/",
};

// Exact overrides verified against GET /v1/models?format=openai.
const MODEL_OVERRIDES: Record<string, string> = {};

export function mapModelId(input: string): string {
  if (MODEL_OVERRIDES[input]) return MODEL_OVERRIDES[input];
  let id = input.replace(/:floor$/, ":cheap").replace(/:(online|thinking|exacto)$/, "");
  for (const [from, to] of Object.entries(ORG_RENAMES)) {
    if (id.startsWith(from)) id = to + id.slice(from.length);
  }
  return id;
}
```

Validate every mapped value against `GET /v1/models?format=openai` before rollout. Do not guess replacement IDs; add an exact override instead. If the code relied on `:online` or `:thinking`, add web search or `reasoning` at the same boundary.

## REST Template
```ts
const response = await fetch("https://api.phaseo.app/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PHASEO_API_KEY}`,
    "Content-Type": "application/json",
    "X-Title": "Your App Name",
    "HTTP-Referer": "https://your-app.example",
  },
  body: JSON.stringify({
    model: mapModelId(currentModelId),
    messages: [{ role: "user", content: "Return exactly: ok" }],
    stream: false,
  }),
});
```

## Validation Commands
```bash
curl -s https://api.phaseo.app/v1/health
```

```bash
curl -s "https://api.phaseo.app/v1/models?format=openai" \
  -H "Authorization: Bearer $PHASEO_API_KEY" | jq -r '.data[].id'
```

```bash
curl -s https://api.phaseo.app/v1/chat/completions \
  -H "Authorization: Bearer $PHASEO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"phaseo/free","messages":[{"role":"user","content":"Return exactly: ok"}]}'
```

```bash
curl -N https://api.phaseo.app/v1/chat/completions \
  -H "Authorization: Bearer $PHASEO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"phaseo/free","stream":true,"messages":[{"role":"user","content":"Return exactly: stream ok"}]}'
```

Repeat the non-streaming call with each mapped production model ID, then run the app's own client path, including tools and structured output if it uses them.

## Migration Report Format
1. Scope: files/components migrated.
2. Config changes: env vars, secrets, and base URLs updated.
3. Model mapping: old IDs to new IDs, including suffixes and routers.
4. Request fields removed or rewritten.
5. Validation evidence: health/models/non-streaming/streaming/failure-path.
6. Parity gaps: unsupported or behavior differences.
7. Rollback plan: exact revert switch.
