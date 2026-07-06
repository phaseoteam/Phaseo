# TypeScript SDK (@phaseo/sdk)

## Install
```bash
pnpm add @phaseo/sdk
```

## Setup
```ts
import AIStats from "@phaseo/sdk";

const client = new AIStats({
  apiKey: process.env.PHASEO_API_KEY!,
});
```

## Text Generation
```ts
const completion = await client.generateText({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "What changed in this PR?" }],
});
```

## Streaming
```ts
for await (const chunk of client.streamText({
  model: "openai/gpt-4o-mini",
  messages: [{ role: "user", content: "Write a haiku about latency." }],
})) {
  process.stdout.write(String(chunk));
}
```

## Other Surfaces
- Responses: `generateResponse`, `streamResponse`
- Images: `generateImage`, `generateImageEdit`
- Audio: `generateSpeech`, `generateTranscription`, `generateTranslation`
- Video: `generateVideo`
- Embeddings: `generateEmbedding`
- Moderation: `generateModeration`
- Discovery: `getModels`, `getHealth`

## Migration Rule
When existing code already uses OpenAI SDK conventions and only needs base URL routing, prefer small diffs first. Move to `@phaseo/sdk` only when unified endpoint helpers are explicitly needed.
