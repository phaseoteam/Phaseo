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
Keep SDK, swap config. Use the root host: the SDK appends `/v1/messages` itself. Pass the key as `authToken`, which sends `Authorization: Bearer` on every SDK version; `apiKey` sends `x-api-key` before `@anthropic-ai/sdk` 1.0, which the gateway rejects.
```ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: null,
  authToken: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app",
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
2. Replace base URL with `https://api.phaseo.app/v1`, or `https://api.phaseo.app` for the Anthropic SDK.
3. Send the key as `Authorization: Bearer`.
4. Verify model IDs via `/v1/models`.
5. Run one non-streaming and one streaming smoke test.
6. Add retries/backoff for 429 and 5xx.
