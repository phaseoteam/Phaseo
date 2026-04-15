# @ai-stats/sdk

TypeScript and JavaScript SDK for AI Stats Gateway.

## Drop-in compatibility

The SDK includes compatibility layers for OpenAI and Anthropic-style clients:

```ts
import { OpenAI } from "@ai-stats/sdk/compat/openai";
import { Anthropic } from "@ai-stats/sdk/compat/anthropic";

const openai = new OpenAI({ apiKey: process.env.AI_STATS_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.AI_STATS_API_KEY });
```

Compatibility guide: [COMPAT_GUIDE.md](./COMPAT_GUIDE.md)

## About

The SDK is generated from `apps/docs/openapi/v1/openapi.yaml` and wrapped with helper methods for common generate and stream workflows.

## Generator workflow

1. `pnpm openapi:lint` to validate the spec.
2. `pnpm oapi:gen` to regenerate SDKs.
3. `pnpm --filter @ai-stats/ts-sdk build` to compile to `dist/`.

The generated directory (`src/gen`) is committed so diffs stay visible in PRs.

## Quick start

```ts
import AIStats from "@ai-stats/sdk";

const client = new AIStats();

const response = await client.responses.create({
  model: "google/gemma-3-27b:free",
  input: "Reply with: SDK quickstart works",
  temperature: 0,
});

console.log(response.output_text);
```

With an explicit key:

```ts
import AIStats from "@ai-stats/sdk";

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY!,
  // baseUrl: "https://api.phaseo.app/v1",
});
```

## Free vs paid models

- `:free` models can be called with zero deposited credits.
- Paid models require available wallet balance.

## Model ID future-proofing

`model` params are typed as `KnownModelId | string`, so newly released model IDs are accepted before the next SDK publish.

## Model deprecation warnings

By default, the SDK checks `/v1/data/models` and warns once per process when you call deprecated or retired models.

```ts
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY!,
  enableDeprecationWarnings: true,
  warningsAsErrors: false,
  logger: (level, message, meta) => {
    console.log(level, message, meta);
  },
});

const info = await client.models.getDeprecationInfo("openai/old-model");
const validation = await client.models.validate("openai/old-model");
```

## DevTools

The SDK includes built-in devtools telemetry capture.

```ts
import { AIStats, createAIStatsDevtools } from "@ai-stats/sdk";

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY!,
  devtools: createAIStatsDevtools({
    directory: ".ai-stats-devtools",
    flushIntervalMs: 2000,
    captureHeaders: true,
    saveAssets: false,
    maxQueueSize: 500,
  }),
});
```

Start the viewer:

```bash
npx @ai-stats/devtools-viewer
```

By default the viewer runs at `http://localhost:4983`.

Environment controls:

```bash
AI_STATS_DEVTOOLS=true
AI_STATS_DEVTOOLS_DIR=./custom-dir
```

Install-time controls:

```bash
AI_STATS_SKIP_POSTINSTALL=true npm install @ai-stats/sdk
AI_STATS_INSTALL_VIEWER=true npm install @ai-stats/sdk
AI_STATS_INSTALL_VIEWER=false npm install @ai-stats/sdk
```

## Smoke test

`pnpm --filter @ai-stats/ts-sdk run test:smoke` runs `packages/sdk/sdk-ts/scripts/smoke.ts` against the public gateway.
Set `AI_STATS_API_KEY` (and optionally `AI_STATS_BASE_URL`) before running.
