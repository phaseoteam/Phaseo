# @phaseo/sdk

Official TypeScript and JavaScript SDK for Phaseo Gateway.

## Installation

```bash
npm install @phaseo/sdk
```

## Quick start

```ts
import Phaseo from "@phaseo/sdk";

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  // baseUrl: "https://api.phaseo.ai/v1",
});

const response = await client.responses.create({
  model: "google/gemma-3-27b:free",
  input: "Reply with: TypeScript SDK works",
});

console.log(response.output_text);
```

## Streaming example

```ts
import Phaseo from "@phaseo/sdk";

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
});

let response = "";
for await (const chunk of client.streamChat({
  model: "google/gemma-3-27b:free",
  messages: [{ role: "user", content: "Stream hi" }],
})) {
  if (chunk.text) {
    response += chunk.text;
    process.stdout.write(chunk.text);
  }

  if (chunk.reasoningTokens) {
    console.log("\nReasoning tokens:", chunk.reasoningTokens);
  }
}
```

## Drop-in compatibility

The SDK includes compatibility layers for OpenAI and Anthropic-style clients.

```ts
import { OpenAI } from "@phaseo/sdk/compat/openai";
import { Anthropic } from "@phaseo/sdk/compat/anthropic";

const openai = new OpenAI({ apiKey: process.env.PHASEO_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.PHASEO_API_KEY });
```

Compatibility guide: [COMPAT_GUIDE.md](./COMPAT_GUIDE.md)

## Common methods

- `client.responses.create(...)`
- `client.chat.completions.create(...)`
- `client.messages.create(...)`
- `client.streamChat(...)`, `client.streamResponses(...)`, and `client.streamMessages(...)` for parsed streaming chunks with `text`, `usage`, and `reasoningTokens`
- `client.models.list(...)`
- `client.listOrganisations(...)` for paginated `/organisations` discovery
- `client.listPricingModels(...)` for `/pricing/models` catalogue pricing discovery
- `client.calculatePricing(...)` for `/pricing/calculate` usage estimation
- `client.listProviders(...)`, `client.getCredits(...)`, `client.getActivity(...)`, and `client.getAnalytics(...)` for provider discovery and management-key usage surfaces
- `client.providers.derankStatus(providerId, ...)` for provider derank health checks
- `client.listApiKeys(...)` for management-key `/keys` discovery
- `client.createApiKey(...)`, `client.updateApiKey(id, ...)`, and `client.deleteApiKey(id)` for management-key API-key lifecycle changes
- `client.getApiKey(id)` for management-key `/keys/{id}` lookup
- `client.listWorkspaces(...)`, `client.getWorkspace(id)`, `client.createWorkspace(...)`, `client.updateWorkspace(id, ...)`, and `client.deleteWorkspace(id)` for management-key workspace lifecycle management
- `client.getCurrentApiKey()`
- `client.getHealth()`
- `client.models.getDeprecationInfo(modelId)`
- `client.models.validate(modelId)`
- `client.ocr.create(...)`, `client.rerank.create(...)`, and `client.music.create(...)` for OCR, rerank, and music generation
- `client.dataModels.list(...)` for `/data/models`

Model discovery supports the public `/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

Use `provider_availability_reason` with `availability: "all"` when you want rollout-state entries such as `preview_only`, `provider_not_ready`, `gated`, `access_limited`, `region_limited`, `project_limited`, `paused`, or `soft_blocked`. Use `capability_status` with `availability: "all"` when you want non-routable endpoint mappings such as `coming_soon` or `internal_testing`.

```ts
const models = await client.models.list({
  provider: ["anthropic"],
  provider_status: ["beta", "not_ready"],
  provider_availability_reason: ["preview_only", "provider_not_ready"],
  capability_status: ["coming_soon", "internal_testing"],
  availability: "all",
});
```

## Async job websocket helpers

Batch and video operations can expose a websocket lifecycle stream at `/v1/async/{kind}/{id}/ws`.
Create responses include the job id, polling URL, optional websocket URL, and sanitized webhook delivery state.

```ts
const batch = await client.batches.create({
  endpoint: "/v1/responses",
  input_file_id: "file_123",
  completion_window: "24h",
  webhook: {
    url: "https://example.com/phaseo/webhooks",
    secret: process.env.PHASEO_WEBHOOK_SECRET,
    events: ["batch.progress", "batch.completed", "batch.failed"],
  },
});

const video = await client.videos.create({
  model: "google/veo-3",
  prompt: "orbital reveal",
  webhook: {
    url: "https://example.com/phaseo/webhooks",
    secret: process.env.PHASEO_WEBHOOK_SECRET,
    events: ["video.progress", "video.completed", "video.failed"],
  },
});
```

```ts
const batchSocketUrl = client.batches.websocketUrl("batch_123", {
  intervalMs: 1500,
});

const videoSocketUrl = client.videos.websocketUrl("video_123", {
  closeOnTerminal: true,
});

const genericSocketUrl = client.getAsyncJobWebSocketUrl("video", "video_123");
```

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Model lifecycle warnings

Deprecation warnings are enabled by default.

```ts
const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  enableDeprecationWarnings: true,
  warningsAsErrors: false,
  logger: (level, message, meta) => {
    console.log(level, message, meta);
  },
});
```

## Environment variables

- `PHASEO_API_KEY` (required unless passed in code)
- `PHASEO_BASE_URL` (optional, defaults to `https://api.phaseo.ai/v1`)

## Devtools

```ts
import { Phaseo, createPhaseoDevtools } from "@phaseo/sdk";

const client = new Phaseo({
  apiKey: process.env.PHASEO_API_KEY,
  devtools: createPhaseoDevtools({
    directory: ".phaseo-devtools",
    captureHeaders: true,
  }),
});
```

Viewer:

```bash
npx @phaseo/devtools-viewer
```

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:ts`
- Run local compatibility tests: `pnpm --filter @phaseo/sdk test`
- Build package: `pnpm --filter @phaseo/sdk build`
- Run live smoke tests explicitly: `pnpm --filter @phaseo/sdk test:smoke`
