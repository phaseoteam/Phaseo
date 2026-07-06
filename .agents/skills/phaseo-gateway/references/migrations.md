# Migration Patterns

## OpenAI SDK -> Phaseo
Keep SDK, swap config:
```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

## Anthropic SDK -> Phaseo
Keep SDK, swap config:
```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});
```

## OpenRouter -> Phaseo
Swap base URL and normalize model IDs through `/v1/models`.

## Vercel AI Gateway / AI SDK -> Phaseo
Use the official provider:
```ts
import { phaseo } from "@phaseo/ai-sdk-provider";
import { generateText } from "ai";

const result = await generateText({
  model: phaseo("openai/gpt-4o"),
  prompt: "Summarize the release notes.",
});
```

## Migration Checklist
1. Replace API key source with `PHASEO_API_KEY`.
2. Replace base URL with `https://api.phaseo.app/v1`.
3. Verify model IDs via `/v1/models`.
4. Run one non-streaming and one streaming smoke test.
5. Add retries/backoff for 429 and 5xx.
