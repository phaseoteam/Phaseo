# Vercel AI Gateway to Phaseo

## Detection signals

- `ai-gateway.vercel.sh/v1`, or the root host `ai-gateway.vercel.sh` in Anthropic SDK clients (move those to `https://api.phaseo.app` with `authToken`; see [anthropic.md](anthropic.md))
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
| `providerOptions.gateway.order` / `.only` | `providerOptions: { phaseo: { provider: { order, only } } }` | `providerOptions.phaseo` is merged into the request body; a leftover `providerOptions.gateway` is silently ignored. Or use a preset or dynamic route with `phaseo("@slug")` |
| `providerOptions.gateway.models` fallbacks | `providerOptions: { phaseo: { models: [...] } }` | Or configure fallbacks in a dynamic route |
| `providerOptions.gateway.sort` (`cost`, `ttft`, `tps`) | `provider.sort` (`price`, `latency`, `throughput`) | |
| `providerOptions.gateway.zeroDataRetention` | `provider.require_zero_data_retention` | Limits routing to ZDR providers |
| `providerOptions.gateway.user` / `.tags` | `user` and `X-Phaseo-Metadata` labels | |
| Request-scoped `byok` credentials | No equivalent | Add provider keys to the workspace (`phaseo byok create`) |
| Text, streaming, tools, structured output, embeddings, images, transcription, speech | Supported by the provider | Capabilities still depend on the model |
| Reranking | `phaseo.rerankingModel(id)` | AI SDK 6 and 7 lines |
| Managed file references, provider-executed tools | Not advertised by the provider | Unsupported parts fail with an error instead of being dropped |
| Vercel OIDC auth | No equivalent | Use `PHASEO_API_KEY` as a server-side secret |
| Gateway usage dashboard | Phaseo request logs and `GET /v1/generations?id=<request_id>` | Provider metadata on results includes the request ID |

## Gotchas

- Set `PHASEO_API_KEY` in every runtime that had the gateway key, including edge and server runtimes and preview deployments.
- A bare string model left behind keeps calling Vercel's gateway; search for `model: "` in AI SDK calls after the change.
- The default `phaseo` export reads `PHASEO_API_KEY` once, when the module is imported; if the variable is set later, every call still throws a missing-key error. Where env loads after imports (some serverless and test setups), call `createPhaseo()` inside the handler instead.
- Keep the old provider available behind a flag for one release so rollback needs no code change.
