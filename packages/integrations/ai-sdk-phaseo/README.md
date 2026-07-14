# Phaseo Gateway Provider for Vercel AI SDK

Official [Vercel AI SDK](https://sdk.vercel.ai/docs) provider for [Phaseo Gateway](https://phaseo.app/), enabling access to 30+ AI providers through a unified interface.

## Features

✨ **Unified Access** - Use 30+ AI providers (OpenAI, Anthropic, Google, Mistral, DeepSeek, and more) through a single SDK
🔄 **Full AI SDK v6 Support** - Works with all Vercel AI SDK primitives:

-   Text: `generateText`, `streamText`, `generateObject`, `streamObject`
-   Embeddings: `embed`, `embedMany`
-   Images: `generateImage`
-   Audio: `experimental_transcribe` (STT), `experimental_generateSpeech` (TTS)
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
npm install @phaseo/ai-sdk-provider ai@^6
```

## Quick Start

### Basic Usage

```typescript
import { phaseo } from "@phaseo/ai-sdk-provider";
import { generateText } from "ai";

const result = await generateText({
	model: phaseo("openai/gpt-4o"),
	prompt: "Explain quantum computing in simple terms",
});

console.log(result.text);
```

### Streaming

```typescript
import { phaseo } from "@phaseo/ai-sdk-provider";
import { streamText } from "ai";

const { textStream } = streamText({
	model: phaseo("anthropic/claude-3-5-sonnet"),
	prompt: "Write a poem about TypeScript",
});

for await (const chunk of textStream) {
	process.stdout.write(chunk);
}
```

### Response Metadata

```typescript
import { phaseo } from "@phaseo/ai-sdk-provider";
import { generateText, streamText } from "ai";

const textResult = await generateText({
	model: phaseo("openai/gpt-4o"),
	prompt: "Say hello",
});

console.log(textResult.response.headers["x-request-id"]);

const streamResult = streamText({
	model: phaseo("anthropic/claude-3-5-sonnet"),
	prompt: "Stream a short greeting",
});

for await (const chunk of streamResult.textStream) {
	process.stdout.write(chunk);
}

console.log(await streamResult.finishReason);
console.log(await streamResult.usage);
console.log(await streamResult.response);
console.log(await streamResult.providerMetadata);
```

### Tool Calling

```typescript
import { phaseo } from "@phaseo/ai-sdk-provider";
import { generateText } from "ai";
import { z } from "zod";

const result = await generateText({
	model: phaseo("openai/gpt-4o"),
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
import { phaseo } from "@phaseo/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";

const { object } = await generateObject({
	model: phaseo("openai/gpt-4o"),
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
import { phaseo } from "@phaseo/ai-sdk-provider";
import { embed, embedMany } from "ai";

// Single embedding
const singleResult = await embed({
	model: phaseo.textEmbeddingModel("openai/text-embedding-3-small"),
	value: "Hello, world!",
});
console.log(singleResult.embedding);
console.log(singleResult.providerMetadata); // Phaseo request/routing metadata

// Batch embeddings
const batchResult = await embedMany({
	model: phaseo.textEmbeddingModel("openai/text-embedding-3-small"),
	values: ["First text", "Second text", "Third text"],
});
console.log(batchResult.embeddings);
console.log(batchResult.providerMetadata); // Phaseo request/routing metadata
```

### Image Generation

```typescript
import { phaseo } from "@phaseo/ai-sdk-provider";
import { generateImage } from "ai";

const result = await generateImage({
	model: phaseo.imageModel("openai/dall-e-3"),
	prompt: "A serene landscape with mountains at sunset",
	size: "1024x1024",
});

console.log(result.images[0].mediaType); // e.g. image/png
console.log(result.images[0].uint8Array.length); // Binary image bytes
if (result.images[0].base64) {
	console.log(result.images[0].base64); // Present for base64-backed gateway responses
}
console.log(result.providerMetadata); // Gateway request/routing metadata (under the gateway key for image calls)
```

### Audio Transcription (Speech-to-Text)

```typescript
import { phaseo } from "@phaseo/ai-sdk-provider";
import { experimental_transcribe } from "ai";
import { readFileSync } from "fs";

const audioData = readFileSync("./audio.mp3");

const result = await experimental_transcribe({
	model: phaseo.transcriptionModel("openai/whisper-1"),
	audio: audioData,
	providerOptions: {
		openai: { language: "en" }, // optional
	},
});

console.log(result.text); // Transcribed text
console.log(result.providerMetadata); // Phaseo request/routing metadata
```

### Text-to-Speech

```typescript
import { phaseo } from "@phaseo/ai-sdk-provider";
import { experimental_generateSpeech } from "ai";
import { writeFileSync } from "fs";

const result = await experimental_generateSpeech({
	model: phaseo.speechModel("openai/tts-1"),
	text: "Hello, this is text to speech!",
	voice: "alloy", // alloy, echo, fable, onyx, nova, shimmer
	outputFormat: "mp3",
});

writeFileSync("./speech.mp3", result.audio.uint8Array);
console.log(result.providerMetadata); // Includes gateway request metadata such as requestId
```

Audio support in `ai@6.0.168` is currently exposed via the experimental helper names above.

## Configuration

### Environment Variable

Set your API key as an environment variable:

```bash
export PHASEO_API_KEY=your_api_key_here
```

Then use the default instance:

```typescript
import { phaseo } from "@phaseo/ai-sdk-provider";

const result = await generateText({
	model: phaseo("openai/gpt-4o"),
	prompt: "Hello!",
});
```

### Custom Configuration

```typescript
import { createPhaseo } from "@phaseo/ai-sdk-provider";

const phaseo = createPhaseo({
	apiKey: "your_api_key",
	baseURL: "https://api.phaseo.app/v1", // optional
	headers: {
		"X-Custom-Header": "value", // optional
	},
});
```

If `apiKey` is omitted, `createPhaseo()` reads `PHASEO_API_KEY`. If `baseURL` is omitted, it reads `PHASEO_BASE_URL`, then uses the default public gateway URL.

### Model Settings

Configure model-specific parameters:

```typescript
const result = await generateText({
	model: phaseo("openai/gpt-4o"),
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

Access 30+ AI providers through the gateway:

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

[View all supported models →](https://phaseo.app/api-providers)

## Model ID Format

Models use the format `provider/model-id`:

```typescript
// OpenAI models
phaseo("openai/gpt-4o");
phaseo("openai/gpt-4-turbo");

// Anthropic models
phaseo("anthropic/claude-3-5-sonnet");
phaseo("anthropic/claude-3-opus");

// Google models
phaseo("google/gemini-2.5-pro-latest");

// DeepSeek models
phaseo("deepseek/deepseek-chat");
```

## API Reference

### `createPhaseo(settings?)`

Creates a new Phaseo provider instance.

**Parameters:**

-   `settings.apiKey` (string, optional) - API key for authentication. Defaults to `PHASEO_API_KEY`.
-   `settings.baseURL` (string, optional) - Gateway base URL. Defaults to `PHASEO_BASE_URL`, then `https://api.phaseo.app/v1`
-   `settings.headers` (object, optional) - Additional headers to include in requests
-   `settings.fetch` (function, optional) - Custom fetch implementation

**Returns:** Provider function `(modelId: string, settings?: ModelSettings) => LanguageModelV3`

### `phaseo(modelId, settings?)`

Default provider instance using `PHASEO_API_KEY`.

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

The package includes comprehensive test coverage using Vitest and mocked gateway responses:

### Run Local Compatibility Tests (Free - No API Calls)

```bash
cd packages/integrations/ai-sdk-phaseo
pnpm test
```

These tests use mocked gateway `fetch` responses to validate the provider's AI SDK compatibility without making actual API calls.

### Run Integration Tests (Explicit Opt-In, Requires API Key)

```bash
PHASEO_API_KEY=your_key pnpm test:gateway
```

Integration tests make real calls to the Phaseo Gateway and are only enabled when `PHASEO_RUN_GATEWAY_TESTS=1` is set. `pnpm test:gateway` sets that opt-in flag for you and runs only the real gateway suite. This keeps the default `pnpm test` path cost-free even if `.env.local` contains a real API key.

### Test Coverage

```bash
pnpm test -- --coverage
```

**Test files:**

-   `tests/language-model.test.ts` - Text generation and streaming compatibility, including response metadata, provider metadata, `generateObject()` / `streamObject()` structured output, non-stream tool calls, and streamed tool-call assembly (local, mocked gateway responses)
-   `tests/embedding-model.test.ts` - Embeddings generation and ordering (local, mocked gateway responses)
-   `tests/image-model.test.ts` - Image generation compatibility for base64 and URL-backed gateway responses
-   `tests/audio-model.test.ts` - Experimental speech/transcription compatibility for AI SDK v6
-   `tests/gateway-test-config.test.ts` - Local regression coverage for paid/live gateway-test gating and env-resolution rules
-   `tests/gateway-integration.test.ts` - Real gateway tests (requires API key)

## Advanced Usage

### Custom Fetch Implementation

```typescript
import { createPhaseo } from "@phaseo/ai-sdk-provider";

const phaseo = createPhaseo({
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
import { phaseo } from "@phaseo/ai-sdk-provider";
import { generateText } from "ai";

try {
	const result = await generateText({
		model: phaseo("openai/gpt-4o"),
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
	model: phaseo("openai/gpt-4o"),
	prompt: "Hello!",
});

console.log("Input tokens:", result.usage.inputTokens);
console.log("Output tokens:", result.usage.outputTokens);
console.log(
	"Total tokens:",
	result.usage.inputTokens + result.usage.outputTokens
);
```

## How It Works

1. **Provider Selection**: You specify a model using `provider/model` format
2. **Gateway Routing**: The Phaseo Gateway routes your request to the appropriate provider
3. **Health-Aware Failover**: If a provider fails, the gateway automatically tries alternatives
4. **Response Normalization**: Responses are normalized to AI SDK format
5. **Usage Tracking**: Token usage and costs are tracked automatically

## Benefits of Using Phaseo Gateway

-   **Unified Billing**: Pay once, use multiple providers
-   **Automatic Failover**: High availability with provider redundancy
-   **Cost Optimization**: Gateway routes to the most cost-effective provider
-   **Usage Analytics**: Detailed analytics and usage tracking
-   **Rate Limit Management**: Gateway handles rate limiting across providers
-   **Model Aliasing**: Use virtual model names that map to real models

## Troubleshooting

### "Phaseo API key is required"

Make sure you've set `PHASEO_API_KEY`, or passed `apiKey` to `createPhaseo()`.

### "Gateway request failed: 401"

Your API key is invalid. Check that you're using the correct key from your Phaseo account.

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
	PhaseoSettings,
	PhaseoModelSettings,
} from "@phaseo/ai-sdk-provider";

const settings: PhaseoSettings = {
	apiKey: "your_key",
	baseURL: "https://api.phaseo.app/v1",
};
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Links

-   [Phaseo Gateway](https://phaseo.app/)
-   [Vercel AI SDK](https://sdk.vercel.ai/docs)
-   [Documentation](https://phaseo.app/docs/v1)
-   [API Reference](https://phaseo.app/docs/v1/api-reference/introduction)
-   [GitHub](https://github.com/phaseoteam/Phaseo)

## Support

-   **Documentation**: https://phaseo.app/docs/v1
-   **Discord**: Join our community
-   **Email**: support@phaseo.ai

---

Made with ❤️ by the Phaseo team
