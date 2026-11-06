# LLM Gateway to Phaseo

## Detection signals

- `api.llmgateway.io/v1`, or `ANTHROPIC_BASE_URL=https://api.llmgateway.io` for Anthropic-style clients
- `LLM_GATEWAY_API_KEY` and any other `LLM_GATEWAY_*` variables, keys starting `llmgtwy_`
- Unprefixed IDs (`gpt-4o`), provider-pinned IDs (`<provider>/<model>`, optionally `:<region>`), and the `auto` or `smart` routers
- `X-LLMGateway-*`, `X-No-Fallback`, `X-Source` and session headers
- `@llmgateway/ai-sdk-provider` or other LLM Gateway SDK packages

## Before and after

LLM Gateway is OpenAI- and Anthropic-compatible: keep payloads unchanged and swap only the boundary. Anthropic-style clients move to the setup in [anthropic.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/anthropic.md).

```ts
// Before
const client = new OpenAI({
  apiKey: process.env.LLM_GATEWAY_API_KEY,
  baseURL: "https://api.llmgateway.io/v1",
});

// After
const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["PHASEO_API_KEY"],
    base_url="https://api.phaseo.app/v1",
)
```

If the app uses LLM Gateway's AI SDK provider, switch to `@phaseo/ai-sdk-provider` as in [vercel-ai-gateway.md](https://raw.githubusercontent.com/phaseoteam/Phaseo/main/.agents/skills/phaseo-migration/references/vercel-ai-gateway.md).

## Model IDs

LLM Gateway's prefix names the serving provider, not the model's maker, so `alibaba/<model>` is not a Phaseo ID. Map each ID to Phaseo's `<org>/<model>`, and keep a provider pin with `provider.only` or a `provider:org/model` ID. Normalize in one boundary function, mapping only to IDs that `GET /v1/models?format=openai` returns:

```ts
const modelMap: Record<string, string> = {
  // "old-alias": "<org>/<model> confirmed in GET /v1/models",
};

export const toPhaseoModel = (id: string) => modelMap[id] ?? id;
```

## Feature mapping

| LLM Gateway | Phaseo | Notes |
| --- | --- | --- |
| Model aliases | Phaseo model IDs or one boundary map | Verify each with `GET /v1/models?format=openai` |
| `auto` router | `phaseo/auto` | Alpha for selected workspaces; can't be combined with `models` |
| Fallback chains | `models` array or dynamic routes | Triggers on 429, 500, 502, 503 and 504, never on request errors |
| `X-No-Fallback` | `provider.allow_fallbacks: false`, or a `provider:org/model` ID | |
| Provider allow and deny logic | `provider.only`, `provider.ignore`, presets | Keep at least one eligible provider |
| `X-LLMGateway-<Key>` custom headers | `X-Phaseo-Metadata` labels | Up to 32 labels |
| Session headers (`x-session-id`) | `session_id` body field | Phaseo ignores session headers on chat, responses and messages |
| `X-Source` | `HTTP-Referer` or `X-App-Name` | |
| Response caching | No equivalent yet | Phaseo does not cache responses |
| Shared prompt and parameter defaults | Presets (`"model": "@slug"`) | Move them out of call sites |
| Provider keys | BYOK (`phaseo byok create` or `POST /v1/byok`), or managed Phaseo credits | BYOK fallback to credits is the `byok_fallback_enabled` workspace setting (`phaseo settings update` or `PATCH /v1/settings`) |
| Request logs, data streams | Request logs, `GET /v1/generations?id=<request_id>`, observability destinations | Replay failed requests from `replay_request` when `replay_supported` is true |

## Gotchas

- Map or remove every `LLM_GATEWAY_*` variable, including in CI and hosting settings.
- Recheck invalid-key and invalid-model handling; error bodies may differ from the old gateway.
