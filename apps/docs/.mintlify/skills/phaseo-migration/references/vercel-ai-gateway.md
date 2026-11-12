# Vercel AI Gateway to Phaseo

## Detection signals

- `ai-gateway.vercel.sh/v1`
- `AI_GATEWAY_API_KEY` (or a custom name such as `VERCEL_AI_GATEWAY_API_KEY`), `VERCEL_OIDC_TOKEN` used for gateway auth
- `@ai-sdk/gateway`, `gateway("...")` model factories, `providerOptions.gateway`
- AI SDK calls (`generateText`, `streamText`, `generateObject`) whose `model` is a bare string such as `"openai/gpt-4.1-mini"`; the AI SDK routes bare strings through Vercel's gateway by default

## Before and after

OpenAI-compatible client: swap the base URL and key.

```ts
// Before
const client = new OpenAI({
  apiKey: process.env.AI_GATEWAY_API_KEY,
  baseURL: "https://ai-gateway.vercel.sh/v1",
});

// After
const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

Vercel AI SDK: install `@phaseo/ai-sdk-provider` and wrap the model ID. The default `phaseo` export reads `PHASEO_API_KEY` and uses `https://api.phaseo.app/v1`.

```ts
// Before
import { generateText } from "ai";
import { gateway } from "@ai-sdk/gateway";

const { text } = await generateText({
  model: gateway("openai/gpt-4.1-mini"),
  prompt: "Reply with: migration ready",
});

// After
import { generateText } from "ai";
import { phaseo } from "@phaseo/ai-sdk-provider";

const { text } = await generateText({
  model: phaseo("phaseo/free"),
  prompt: "Reply with: migration ready",
});
```

Use `createPhaseo({ apiKey, baseURL, headers })` when the key or attribution headers come from config rather than the environment. If the app passes bare string model IDs everywhere, change the shared model factory once rather than every call site.

Provider lines: AI SDK 7 uses the default `@phaseo/ai-sdk-provider`; AI SDK 6 uses `@phaseo/ai-sdk-provider@ai-sdk-v6`; AI SDK 5 uses `@phaseo/ai-sdk-provider@ai-sdk-v5`. Match the installed `ai` major.

## Feature mapping

| Vercel AI Gateway | Phaseo | Notes |
| --- | --- | --- |
| `providerOptions.gateway.order` / `.only` | `provider.order` / `provider.only` | Prefer a preset or dynamic route; call it with `phaseo("@slug")` |
| `providerOptions.gateway.models` fallbacks | `models` array | Or configure fallbacks in a dynamic route |
| Text, streaming, tools, structured output, embeddings, images, transcription, speech | Supported by the provider | Capabilities still depend on the model |
| Reranking | `phaseo.rerankingModel(id)` | AI SDK 6 and 7 lines |
| Managed file references, provider-executed tools | Not advertised by the provider | Unsupported parts fail with an error instead of being dropped |
| Vercel OIDC auth | No equivalent | Use `PHASEO_API_KEY` as a server-side secret |
| Gateway usage dashboard | Phaseo request logs and `GET /v1/generations?id=<request_id>` | Provider metadata on results includes the request ID |

## Gotchas

- Set `PHASEO_API_KEY` in every runtime that had the gateway key, including edge and server runtimes and preview deployments.
- A bare string model left behind keeps calling Vercel's gateway; search for `model: "` in AI SDK calls after the change.
- Keep the old provider available behind a flag for one release so rollback needs no code change.
