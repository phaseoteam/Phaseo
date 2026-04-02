# @ai-stats/sdk

TypeScript/JavaScript SDK for the AI Stats Gateway - Access 400+ AI models from OpenAI, Anthropic, Google, Meta, and more through a unified API.

## ✨ Drop-in Replacement for OpenAI & Anthropic SDKs

The AI Stats SDK provides **drop-in replacement** compatibility layers that let you switch from OpenAI or Anthropic SDKs with minimal code changes:

```typescript
// Instead of: import OpenAI from 'openai';
import { OpenAI } from '@ai-stats/sdk/compat/openai';

// Instead of: import Anthropic from '@anthropic-ai/sdk';
import { Anthropic } from '@ai-stats/sdk/compat/anthropic';

// Use the exact same API, but with access to 400+ models!
const openai = new OpenAI({ apiKey: process.env.AI_STATS_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.AI_STATS_API_KEY });
```

**📖 [Read the full Compatibility Guide →](./COMPAT_GUIDE.md)**

---

## About

TypeScript client for the AI Stats Gateway. The SDK is generated from `apps/docs/openapi/v1/openapi.yaml` and wrapped with a small helper class for the common "AI SDK" style helpers (generate/stream and resource getters).

## Generator workflow

1. `pnpm openapi:lint` - validate the spec.
2. `pnpm oapi:gen` - regenerate all SDKs (TS, Py, and preview SDKs for other languages).
3. `pnpm --filter @ai-stats/ts-sdk build` - compile wrapper + generated code into `dist/`.

The generated directory (`src/gen`) is committed so diffs are visible in PRs. Regenerate whenever the API spec changes.

## Usage

```ts
import AIStats from "@ai-stats/sdk";

// Uses AI_STATS_API_KEY from environment by default.
const client = new AIStats();

const response = await client.responses.create({
  model: "openai/gpt-5.4",
  input: "Write a one-sentence bedtime story about a unicorn.",
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

### Model ID Future-Proofing

`model` params are typed as `KnownModelId | string`, so new gateway models work before the next SDK publish while still preserving autocomplete for known IDs.

### Model Deprecation Warnings

By default, the SDK checks `/v1/data/models` and warns once per process when you call a deprecated or retired model.

```ts
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY!,
  enableDeprecationWarnings: true, // default
  warningsAsErrors: false, // set true to throw instead of warn
  logger: (level, message, meta) => {
    console.log(level, message, meta);
  },
});

const info = await client.models.getDeprecationInfo("openai/old-model");
const validation = await client.models.validate("openai/old-model");
```

## DevTools

AI Stats SDK includes built-in devtools for debugging and inspecting API requests. DevTools captures all API calls, responses, errors, costs, and usage locally and provides a beautiful web UI for viewing them.

> **📦 Installation Note**: When you install the SDK, you'll be prompted to optionally install the devtools viewer. The telemetry capture is always included, but the viewer is optional.

### Quick Start

```ts
import { AIStats, createAIStatsDevtools } from "@ai-stats/sdk";

// Simple - enable devtools with one line
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY!,
  devtools: createAIStatsDevtools()
});

// All API calls are now automatically captured!
await client.chat.completions.create({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }]
});
```

### Custom Configuration

```ts
import { AIStats, createAIStatsDevtools } from "@ai-stats/sdk";

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY!,
  devtools: createAIStatsDevtools({
    directory: "./my-devtools-data",  // Custom directory
    flushIntervalMs: 2000,            // Flush every 2 seconds
    captureHeaders: true,              // Capture HTTP headers
    saveAssets: false,                 // Don't save binary assets
    maxQueueSize: 500                  // Custom queue size
  })
});
```

### No Extra Core Package Required

`createAIStatsDevtools` and telemetry capture are bundled directly in `@ai-stats/sdk`,
so there is no separate devtools-core dependency to install.

### Environment Variable Control

By default, devtools is enabled in development (`NODE_ENV !== 'production'`) but can be controlled via environment variables:

```bash
# Enable explicitly
AI_STATS_DEVTOOLS=true

# Custom directory
AI_STATS_DEVTOOLS_DIR=./custom-dir

# Then run your script
tsx your-script.ts
```

#### Installation Environment Variables

Control the post-install prompt behavior:

```bash
# Skip the interactive prompt entirely
AI_STATS_SKIP_POSTINSTALL=true npm install @ai-stats/sdk

# Auto-install viewer without prompting
AI_STATS_INSTALL_VIEWER=true npm install @ai-stats/sdk

# Auto-skip viewer without prompting
AI_STATS_INSTALL_VIEWER=false npm install @ai-stats/sdk
```

### View Captured Data

Start the devtools viewer to inspect your API requests:

```bash
npx @ai-stats/devtools-viewer
```

Then open http://localhost:4983 to see your API requests in real-time with:

- **Live telemetry** - Auto-refreshes every 2 seconds
- **Smart filtering** - Filter by endpoint, model, provider, status
- **Cost tracking** - See exact costs and token usage
- **Error debugging** - Full error details with actionable solutions
- **Quick actions** - Copy requests, generate cURL/Python/TypeScript code
- **Dark mode** - Beautiful UI with theme switching
- **Export** - Download data as JSON for further analysis

### Pattern

This pattern is inspired by [OpenRouter's devtools](https://openrouter.ai/docs/developer-tools):

```ts
// OpenRouter pattern
import { createOpenRouterDevtools } from '@openrouter/devtools';
const sdk = new OpenRouter({ hooks: createOpenRouterDevtools() });

// AI Stats pattern
import { createAIStatsDevtools } from '@ai-stats/sdk';
const client = new AIStats({ devtools: createAIStatsDevtools() });
```

### Example

See `examples/devtools-integration.ts` for a complete example with different configuration options.

## Smoke test

`pnpm --filter @ai-stats/ts-sdk run test:smoke` runs `packages/sdk/sdk-ts/scripts/smoke.ts` against the public gateway. Set `AI_STATS_API_KEY` (and optionally `AI_STATS_BASE_URL`) before running it.
