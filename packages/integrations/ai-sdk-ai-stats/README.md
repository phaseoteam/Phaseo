# AI Stats Gateway Provider for Vercel AI SDK

Official [Vercel AI SDK](https://sdk.vercel.ai/docs) provider for [AI Stats Gateway](https://ai-stats.phaseo.app/), enabling access to 55+ AI providers through a unified interface.

## Features

✨ **Unified Access** - Use 55+ AI providers (OpenAI, Anthropic, Google, Mistral, DeepSeek, and more) through a single SDK
🔄 **Full AI SDK v6 Support** - Works with all Vercel AI SDK primitives:

-   Text: `generateText`, `streamText`, `generateObject`, `streamObject`
-   Embeddings: `embed`, `embedMany`
-   Images: `generateImage`
-   Audio: `transcribe` (STT), `speak` (TTS)
    🛠️ **Tool Calling** - Complete support for function/tool calling with parallel execution
    📦 **Structured Output** - Generate typed objects with JSON schemas
    🔢 **Embeddings** - Generate vector embeddings for semantic search and similarity
    🖼️ **Image Generation** - Create images from text prompts (DALL-E, Flux, etc.)
    🎙️ **Speech & Transcription** - Text-to-speech and speech-to-text capabilities
    ⚡ **Streaming** - Real-time token streaming with usage tracking
    🔐 **Type-Safe** - Full TypeScript support with strict types
    🌐 **Provider Routing** - Automatic health-aware routing and failover

## Installation

```bash
npm install @ai-stats/ai-sdk-provider ai@^6
```

## Quick Start

### Basic Usage

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { generateText } from "ai";

const result = await generateText({
	model: aiStats("openai/gpt-4o"),
	prompt: "Explain quantum computing in simple terms",
});

console.log(result.text);
```

### Streaming

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { streamText } from "ai";

const { textStream } = await streamText({
	model: aiStats("anthropic/claude-3-5-sonnet"),
	prompt: "Write a poem about TypeScript",
});

for await (const chunk of textStream) {
	process.stdout.write(chunk);
}
```

### Tool Calling

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";

const result = await generateText({
	model: aiStats("openai/gpt-4o"),
	prompt: "What is the weather in San Francisco?",
	tools: {
		getWeather: {
			description: "Get weather for a location",
			parameters: z.object({
				location: z.string(),
			}),
			execute: async ({ location }) => ({
				temperature: 72,
				conditions: "sunny",
			}),
		},
	},
});
```

### Structured Output

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";

const { object } = await generateObject({
	model: aiStats("openai/gpt-4o"),
	schema: z.object({
		name: z.string(),
		age: z.number(),
		email: z.string().email(),
	}),
	prompt: "Generate a sample user profile",
});
```

### Embeddings

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { embed, embedMany } from "ai";

// Single embedding
const { embedding } = await embed({
	model: aiStats.textEmbeddingModel("openai/text-embedding-3-small"),
	value: "Hello, world!",
});

// Batch embeddings
const { embeddings } = await embedMany({
	model: aiStats.textEmbeddingModel("openai/text-embedding-3-small"),
	values: ["First text", "Second text", "Third text"],
});
```

### Image Generation

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { generateImage } from "ai";

const { images } = await generateImage({
	model: aiStats.imageModel("openai/dall-e-3"),
	prompt: "A serene landscape with mountains at sunset",
	size: "1024x1024",
});

console.log(images[0].url); // Image URL or base64
```

### Audio Transcription (Speech-to-Text)

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { transcribe } from "ai";
import { readFileSync } from "fs";

const audioData = readFileSync("./audio.mp3");

const { text, segments } = await transcribe({
	model: aiStats.transcriptionModel("openai/whisper-1"),
	audioData: new Blob([audioData], { type: "audio/mp3" }),
	language: "en", // optional
});

console.log(text); // Transcribed text
```

### Text-to-Speech

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { speak } from "ai";
import { writeFileSync } from "fs";

const { audio } = await speak({
	model: aiStats.speechModel("openai/tts-1"),
	text: "Hello, this is text to speech!",
	voice: "alloy", // alloy, echo, fable, onyx, nova, shimmer
	outputFormat: "mp3",
});

writeFileSync("./speech.mp3", audio);
```

## Configuration

### Environment Variable

Set your API key as an environment variable:

```bash
export AI_STATS_API_KEY=your_api_key_here
```

Then use the default instance:

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";

const result = await generateText({
	model: aiStats("openai/gpt-4o"),
	prompt: "Hello!",
});
```

### Custom Configuration

```typescript
import { createAIStats } from "@ai-stats/ai-sdk-provider";

const aiStats = createAIStats({
	apiKey: "your_api_key",
	baseURL: "https://api.phaseo.app/v1", // optional
	headers: {
		"X-Custom-Header": "value", // optional
	},
});
```

### Model Settings

Configure model-specific parameters:

```typescript
const result = await generateText({
	model: aiStats("openai/gpt-4o"),
	prompt: "Hello!",
	temperature: 0.7,
	maxTokens: 1000,
	topP: 0.9,
	frequencyPenalty: 0.5,
	presencePenalty: 0.5,
	seed: 12345, // for deterministic output
});
```

## Supported Providers

Access 55+ AI providers through the gateway:

### Major Providers

-   **OpenAI**: `openai/gpt-4o`, `openai/gpt-4-turbo`, `openai/gpt-3.5-turbo`
-   **Anthropic**: `anthropic/claude-3-5-sonnet`, `anthropic/claude-3-opus`, `anthropic/claude-3-haiku`
-   **Google**: `google/gemini-2.5-pro-latest`, `google/gemini-2.5-flash-latest`
-   **Mistral**: `mistral/mistral-large`, `mistral/mistral-small`
-   **X.AI**: `x-ai/grok-3`, `x-ai/grok-2`

### Open Source Models

-   **DeepSeek**: `deepseek/deepseek-chat`, `deepseek/deepseek-coder`
-   **Qwen**: `qwen/qwen-3-235b`, `qwen/qwen-3-32b`
-   **Meta**: `meta/llama-3.3-70b`, `meta/llama-3.1-405b`

### Specialized Providers

-   **Groq**: Ultra-fast inference for Llama, Mixtral, Gemma
-   **Together AI**: Open source models with fast inference
-   **Fireworks**: Optimized inference for open models
-   **Cerebras**: Extremely fast inference

[View all supported models →](https://ai-stats.phaseo.app/api-providers)

## Model ID Format

Models use the format `provider/model-id`:

```typescript
// OpenAI models
aiStats("openai/gpt-4o");
aiStats("openai/gpt-4-turbo");

// Anthropic models
aiStats("anthropic/claude-3-5-sonnet");
aiStats("anthropic/claude-3-opus");

// Google models
aiStats("google/gemini-2.5-pro-latest");

// DeepSeek models
aiStats("deepseek/deepseek-chat");
```

## API Reference

### `createAIStats(settings?)`

Creates a new AI Stats provider instance.

**Parameters:**

-   `settings.apiKey` (string, optional) - API key for authentication. Defaults to `AI_STATS_API_KEY` env var.
-   `settings.baseURL` (string, optional) - Gateway base URL. Default: `https://api.phaseo.app/v1`
-   `settings.headers` (object, optional) - Additional headers to include in requests
-   `settings.fetch` (function, optional) - Custom fetch implementation

**Returns:** Provider function `(modelId: string, settings?: ModelSettings) => LanguageModelV3`

### `aiStats(modelId, settings?)`

Default provider instance using `AI_STATS_API_KEY` environment variable.

**Parameters:**

-   `modelId` (string, required) - Model ID in format `provider/model`
-   `settings` (object, optional) - Model-specific settings

**Model Settings:**

-   `temperature` (number) - Sampling temperature (0-2)
-   `maxTokens` (number) - Maximum tokens to generate
-   `topP` (number) - Nucleus sampling threshold (0-1)
-   `topK` (number) - Top-K sampling threshold
-   `frequencyPenalty` (number) - Frequency penalty (-2.0 to 2.0)
-   `presencePenalty` (number) - Presence penalty (-2.0 to 2.0)
-   `seed` (number) - Random seed for deterministic output
-   `user` (string) - User identifier for tracking

## Examples

See the [`examples/`](./examples) directory for complete working examples:

**Text & Language:**

-   [basic-text.ts](./examples/basic-text.ts) - Simple text generation
-   [streaming.ts](./examples/streaming.ts) - Streaming text generation
-   [tools.ts](./examples/tools.ts) - Function/tool calling
-   [structured-output.ts](./examples/structured-output.ts) - Generating structured data

**Embeddings & Search:**

-   [embeddings.ts](./examples/embeddings.ts) - Vector embeddings and similarity

**Images:**

-   [image-generation.ts](./examples/image-generation.ts) - Generate images from text

**Audio:**

-   [audio-transcription.ts](./examples/audio-transcription.ts) - Speech-to-text
-   [text-to-speech.ts](./examples/text-to-speech.ts) - Text-to-speech

**Multi-Provider:**

-   [multi-provider.ts](./examples/multi-provider.ts) - Comparing multiple providers

## Testing

The package includes comprehensive test coverage using Vitest and AI SDK mock models:

### Run Mock Tests (Free - No API Calls)

```bash
cd packages/integrations/ai-sdk-ai-stats
pnpm test
```

Mock tests use `MockLanguageModelV3` and `MockEmbeddingModelV3` from `ai/test` to validate functionality without making actual API calls.

### Run Integration Tests (Requires API Key)

```bash
AI_STATS_API_KEY=your_key pnpm test
```

Integration tests make real calls to the AI Stats Gateway and are automatically enabled when an API key is present.

### Test Coverage

```bash
pnpm test -- --coverage
```

**Test files:**

-   `tests/language-model.test.ts` - Text generation, streaming, tools, structured output (mocked)
-   `tests/embedding-model.test.ts` - Embeddings generation and similarity (mocked)
-   `tests/gateway-integration.test.ts` - Real gateway tests (requires API key)

## Advanced Usage

### Custom Fetch Implementation

```typescript
import { createAIStats } from "@ai-stats/ai-sdk-provider";

const aiStats = createAIStats({
	fetch: async (url, init) => {
		console.log("Request:", url);
		const response = await fetch(url, init);
		console.log("Response:", response.status);
		return response;
	},
});
```

### Error Handling

```typescript
import { aiStats } from "@ai-stats/ai-sdk-provider";
import { generateText } from "ai";

try {
	const result = await generateText({
		model: aiStats("openai/gpt-4o"),
		prompt: "Hello!",
	});
} catch (error: any) {
	if (error.status === 401) {
		console.error("Invalid API key");
	} else if (error.status === 429) {
		console.error("Rate limit exceeded");
	} else if (error.status >= 500) {
		console.error("Server error, will retry");
	} else {
		console.error("Error:", error.message);
	}
}
```

### Usage Tracking

```typescript
const result = await generateText({
	model: aiStats("openai/gpt-4o"),
	prompt: "Hello!",
});

console.log("Prompt tokens:", result.usage.promptTokens);
console.log("Completion tokens:", result.usage.completionTokens);
console.log(
	"Total tokens:",
	result.usage.promptTokens + result.usage.completionTokens
);
```

## How It Works

1. **Provider Selection**: You specify a model using `provider/model` format
2. **Gateway Routing**: The AI Stats Gateway routes your request to the appropriate provider
3. **Health-Aware Failover**: If a provider fails, the gateway automatically tries alternatives
4. **Response Normalization**: Responses are normalized to AI SDK format
5. **Usage Tracking**: Token usage and costs are tracked automatically

## Benefits of Using AI Stats Gateway

-   **Unified Billing**: Pay once, use multiple providers
-   **Automatic Failover**: High availability with provider redundancy
-   **Cost Optimization**: Gateway routes to the most cost-effective provider
-   **Usage Analytics**: Detailed analytics and usage tracking
-   **Rate Limit Management**: Gateway handles rate limiting across providers
-   **Model Aliasing**: Use virtual model names that map to real models

## Troubleshooting

### "AI Stats API key is required"

Make sure you've set the `AI_STATS_API_KEY` environment variable or passed `apiKey` to `createAIStats()`.

### "Gateway request failed: 401"

Your API key is invalid. Check that you're using the correct key from your AI Stats account.

### "Gateway request failed: 429"

You've exceeded your rate limit. Wait a moment and try again, or upgrade your plan.

### Streaming not working

Ensure you're using `streamText` or `streamObject` from the AI SDK, not `generateText` or `generateObject`.

### Tool calls not being executed

Make sure you've provided the `execute` function in your tool definition. The AI SDK handles execution automatically.

## TypeScript Support

This package is written in TypeScript and provides full type definitions:

```typescript
import type {
	AIStatsSettings,
	AIStatsModelSettings,
} from "@ai-stats/ai-sdk-provider";

const settings: AIStatsSettings = {
	apiKey: "your_key",
	baseURL: "https://api.phaseo.app/v1",
};
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Links

-   [AI Stats Gateway](https://ai-stats.phaseo.app/)
-   [Vercel AI SDK](https://sdk.vercel.ai/docs)
-   [Documentation](https://ai-stats.phaseo.app/docs)
-   [API Reference](https://ai-stats.phaseo.app/docs/api)
-   [GitHub](https://github.com/ai-stats/ai-stats)

## Support

-   **Documentation**: https://ai-stats.phaseo.app/docs
-   **Discord**: Join our community
-   **Email**: support@ai-stats.phaseo.app

---

Made with ❤️ by the AI Stats team
