# Migration Patterns

## OpenAI SDK -> AI Stats
Keep SDK, swap config:
```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

## Anthropic SDK -> AI Stats
Keep SDK, swap config:
```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.AI_STATS_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

## OpenRouter -> AI Stats
Swap base URL and normalize model IDs through `/v1/models`.

## Vercel AI Gateway / AI SDK -> AI Stats
Use the official provider:
```ts
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { generateText } from "ai";

const result = await generateText({
  model: aiStats("openai/gpt-4o"),
  prompt: "Summarize the release notes.",
});
```

## Migration Checklist
1. Replace API key source with `AI_STATS_API_KEY`.
2. Replace base URL with `https://api.phaseo.app/v1`.
3. Verify model IDs via `/v1/models`.
4. Run one non-streaming and one streaming smoke test.
5. Add retries/backoff for 429 and 5xx.
