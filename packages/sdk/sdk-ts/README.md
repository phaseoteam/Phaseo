# @ai-stats/sdk

Official TypeScript and JavaScript SDK for AI Stats Gateway.

## Installation

```bash
npm install @ai-stats/sdk
```

## Quick start

```ts
import AIStats from "@ai-stats/sdk";

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  // baseUrl: "https://api.phaseo.app/v1",
});

const response = await client.responses.create({
  model: "google/gemma-3-27b:free",
  input: "Reply with: TypeScript SDK works",
});

console.log(response.output_text);
```

## Drop-in compatibility

The SDK includes compatibility layers for OpenAI and Anthropic-style clients.

```ts
import { OpenAI } from "@ai-stats/sdk/compat/openai";
import { Anthropic } from "@ai-stats/sdk/compat/anthropic";

const openai = new OpenAI({ apiKey: process.env.AI_STATS_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.AI_STATS_API_KEY });
```

Compatibility guide: [COMPAT_GUIDE.md](./COMPAT_GUIDE.md)

## Common methods

- `client.responses.create(...)`
- `client.chat.completions.create(...)`
- `client.models.list(...)`
- `client.listOrganisations(...)` for paginated `/organisations` discovery
- `client.listPricingModels(...)` for `/pricing/models` catalogue pricing discovery
- `client.calculatePricing(...)` for `/pricing/calculate` usage estimation
- `client.listProviders(...)`, `client.getCredits(...)`, `client.getActivity(...)`, and `client.getAnalytics(...)` for provider discovery and management-key usage surfaces
- `client.listApiKeys(...)` for management-key `/keys` discovery
- `client.createApiKey(...)`, `client.updateApiKey(id, ...)`, and `client.deleteApiKey(id)` for management-key API-key lifecycle changes
- `client.getApiKey(id)` for management-key `/keys/{id}` lookup
- `client.listWorkspaces(...)`, `client.getWorkspace(id)`, `client.createWorkspace(...)`, `client.updateWorkspace(id, ...)`, and `client.deleteWorkspace(id)` for management-key workspace lifecycle management
- `client.getCurrentApiKey()`
- `client.getHealth()`
- `client.models.getDeprecationInfo(modelId)`
- `client.models.validate(modelId)`
- `client.batches.create(...)`, `client.batches.wait(id)`, `client.batches.listRequests(id)`, and `client.batches.cancel(id)` for async batch jobs
- `client.webhooks.verifySignature(...)` or `AIStats.verifyWebhookSignature(...)` for signed async webhook deliveries

Model discovery supports the public `/gateway/models` filters, including `provider`, `provider_status`, `provider_routing_status`, `model_routing_status`, `capability_status`, `provider_availability_status`, `provider_availability_reason`, `status`, `organisation`, `endpoints`, `input_types`, `output_types`, `params`, `availability`, `limit`, and `offset`.

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

```ts
const batchSocketUrl = client.batches.websocketUrl("batch_123", {
  intervalMs: 1500,
});

const videoSocketUrl = client.videos.websocketUrl("video_123", {
  closeOnTerminal: true,
});

const genericSocketUrl = client.getAsyncJobWebSocketUrl("video", "video_123");
```

## Batch jobs

Use batch helpers when you want deferred execution with polling and webhooks. Batch jobs support OpenAI, Anthropic, Google Gemini, Mistral, xAI, Groq, and Together AI through the requested `model`; `provider` is only needed as an advanced routing constraint.

```ts
const batch = await client.batches.create({
  model: "openai/gpt-5-mini",
  prompts: [
    "Summarize this record.",
    "Classify this support ticket.",
  ],
  system: "Be concise.",
  max_tokens: 256,
  completion_window: "24h",
  webhook_endpoint_id: "we_123",
});

const completed = await client.batches.wait(batch.id!, {
  intervalMs: 5000,
  timeoutMs: 30 * 60 * 1000,
});

const rows = await client.batches.listRequests(completed.id!, {
  status: "completed",
});
```

For large prebuilt JSONL inputs, upload with `client.uploadFile({ model, purpose: "batch", file })` and create the batch with `input_file_id`. The default path above lets AI Stats create provider files or inline requests for you.

Webhook consumers can verify AI Stats signatures before processing the payload:

```ts
const body = await request.text();
const verified = await AIStats.verifyWebhookSignature({
  body,
  secret: process.env.AI_STATS_BATCH_WEBHOOK_SECRET!,
  timestamp: request.headers.get("x-ai-stats-timestamp"),
  signature: request.headers.get("x-ai-stats-signature"),
  toleranceSeconds: 300,
});
```

## Free and paid models

- Models with `:free` in the model ID can be called with zero deposited credits.
- Paid models require available wallet balance.

## Model lifecycle warnings

Deprecation warnings are enabled by default.

```ts
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  enableDeprecationWarnings: true,
  warningsAsErrors: false,
  logger: (level, message, meta) => {
    console.log(level, message, meta);
  },
});
```

## Environment variables

- `AI_STATS_API_KEY` (required unless passed in code)
- `AI_STATS_BASE_URL` (optional, defaults to `https://api.phaseo.app/v1`)

## Devtools

```ts
import { AIStats, createAIStatsDevtools } from "@ai-stats/sdk";

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY,
  devtools: createAIStatsDevtools({
    directory: ".ai-stats-devtools",
    captureHeaders: true,
  }),
});
```

Viewer:

```bash
npx @ai-stats/devtools-viewer
```

## Regeneration and local checks

- Regenerate generated client: `pnpm openapi:gen:ts`
- Run local compatibility tests: `pnpm --filter @ai-stats/sdk test`
- Build package: `pnpm --filter @ai-stats/sdk build`
- Run live smoke tests explicitly: `pnpm --filter @ai-stats/sdk test:smoke`
