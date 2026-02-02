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
2. `pnpm openapi:gen` - regenerate all SDKs (TS, Py, and preview SDKs for other languages).
3. `pnpm --filter @ai-stats/ts-sdk build` - compile wrapper + generated code into `dist/`.

The generated directory (`src/gen`) is committed so diffs are visible in PRs. Regenerate whenever the API spec changes.

## Usage

```ts
import { AIStats, MODEL_IDS } from "@ai-stats/ts-sdk";

const client = new AIStats({ apiKey: process.env.AI_STATS_API_KEY! });

// text
const completion = await client.generateText({
	model: MODEL_IDS[0],
	messages: [{ role: "user", content: "Say hi." }],
});

// streaming text
for await (const chunk of client.streamText({
	model: MODEL_IDS[0],
	messages: [{ role: "user", content: "Stream hi." }],
})) {
	process.stdout.write(chunk);
}

// models
const models = await client.getModels();
console.log(models.data.map((m) => m.id));

// images, embeddings, moderation, video, speech, transcription
await client.generateImage({ model: "image-alpha", prompt: "A purple nebula" });
await client.generateEmbedding({ input: "hello", model: MODEL_IDS[0] });
await client.generateModeration({ model: MODEL_IDS[0], input: "Safe?" });
await client.generateVideo({ model: "video-alpha", prompt: "A calm ocean" });
await client.generateSpeech({ model: "tts-alpha", input: "Hello!" });
await client.generateTranscription({
	model: "whisper-alpha",
	file: "<base64>",
});
```

## DevTools

AI Stats SDK includes built-in devtools for debugging and inspecting API requests. DevTools captures all API calls, responses, errors, costs, and usage in a local JSONL file and provides a web UI for viewing them.

### Quick Start

Enable devtools with an environment variable:

```bash
AI_STATS_DEVTOOLS=true tsx your-script.ts
```

Or in code:

```ts
const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY!,
  devtools: {
    enabled: true,
    directory: ".ai-stats-devtools", // Default
    flushIntervalMs: 1000 // Flush every 1 second
  }
});
```

### View Telemetry

Start the web viewer:

```bash
npx @ai-stats/devtools-viewer start
```

Then open http://localhost:4983 to see your API requests in real-time.

### Features

- **Live telemetry** - Auto-refreshes every 2 seconds
- **Adaptive UI** - Different views for chat, images, audio, video
- **Analytics** - Aggregate stats by endpoint, model, cost, tokens
- **Export** - Download telemetry as JSON or JSONL
- **Zero performance impact** - Async capture, < 5ms overhead

### Example

See `examples/devtools-demo.ts` for a complete example.

```ts
import { AIStats } from "@ai-stats/sdk";

const client = new AIStats({
  apiKey: process.env.AI_STATS_API_KEY!,
  devtools: { enabled: true }
});

// All API calls are automatically captured
await client.generateText({
  model: "gpt-4",
  messages: [{ role: "user", content: "Hello!" }]
});

// View in the devtools viewer at http://localhost:4983
```

## Smoke test

`pnpm --filter @ai-stats/ts-sdk run test:smoke` runs `packages/sdk-ts/scripts/smoke.ts` against the public gateway. Set `AI_STATS_API_KEY` (and optionally `AI_STATS_BASE_URL`) before running it.
