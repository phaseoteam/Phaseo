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
- `client.models.getDeprecationInfo(modelId)`
- `client.models.validate(modelId)`

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
- Build package: `pnpm --filter @ai-stats/ts-sdk build`
- Smoke tests: `pnpm --filter @ai-stats/ts-sdk test:smoke`
