# LLM Gateway to Phaseo

## Detection signals

- `api.llmgateway.io/v1`
- `LLM_GATEWAY_API_KEY` and any other `LLM_GATEWAY_*` variables
- Unprefixed model aliases such as `gpt-4o` alongside `<org>/<model>` IDs
- LLM Gateway SDK or AI SDK provider packages

## Before and after

LLM Gateway is OpenAI-compatible: keep payloads unchanged and swap only the boundary.

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

Normalize unprefixed aliases in one boundary function, mapping only to IDs that `GET /v1/models` returns:

```ts
const modelMap: Record<string, string> = {
  // "old-alias": "<org>/<model> confirmed in GET /v1/models",
};

export const toPhaseoModel = (id: string) => modelMap[id] ?? id;
```

## Feature mapping

| LLM Gateway | Phaseo | Notes |
| --- | --- | --- |
| Model aliases | Phaseo model IDs or one boundary map | Verify each with `GET /v1/models` |
| Fallback chains | `models` array or dynamic routes | Triggers on 429 and 5xx |
| Provider allow and deny logic | `provider.only`, `provider.ignore`, presets | Keep at least one eligible provider |
| Shared prompt and parameter defaults | Presets (`"model": "@slug"`) | Move them out of call sites |
| Provider keys | BYOK, or managed Phaseo credits | BYOK fallback to credits is a dashboard setting |
| Request logs | Request logs and `GET /v1/generations?id=<request_id>` | Replay failed requests from `replay_request` when `replay_supported` is true |

## Gotchas

- Map or remove every `LLM_GATEWAY_*` variable, including in CI and hosting settings.
- Recheck invalid-key and invalid-model handling; error bodies may differ from the old gateway.
