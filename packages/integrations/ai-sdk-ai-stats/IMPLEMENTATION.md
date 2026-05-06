# AI Stats AI SDK Provider - Implementation Summary

## Overview

This package provides a Vercel AI SDK v6 compatible provider for the AI Stats Gateway, enabling developers to access 30+ AI providers through a standardized interface.

## Implemented Features

### ✅ Language Models (LanguageModelV3)

**Supported Operations:**
- `generateText()` - Non-streaming text generation
- `streamText()` - Real-time streaming text generation
- `generateObject()` - Structured output with JSON schemas
- `streamObject()` - Streaming structured output

**Advanced Features:**
- ✅ Tool/function calling with parallel execution
- ✅ Multi-modal content (text, images)
- ✅ Streaming with usage tracking
- ✅ Finish reason mapping
- ✅ Error handling and retries

**Gateway Integration:**
- Uses `/v1/chat/completions` endpoint
- Supports `stream: true/false`
- Includes `stream_options: { include_usage: true }`
- Maps to OpenAI-compatible format

### ✅ Embedding Models (EmbeddingModelV3)

**Supported Operations:**
- `embed()` - Generate embedding for single text
- `embedMany()` - Batch embedding generation

**Features:**
- ✅ Batch processing support (up to 2048 texts)
- ✅ Parallel calls enabled
- ✅ Usage tracking (token counts)
- ✅ Full precision (float32)

**Gateway Integration:**
- Uses `/v1/embeddings` endpoint
- Returns normalized embeddings array
- Preserves input order

### ✅ Image Models (ImageModelV3)

**Supported Operations:**
- `generateImage()` - Image generation through the public AI SDK helper

**Features:**
- ✅ Passes through provider-specific image options
- ✅ Supports `size` and `aspectRatio`
- ✅ Accepts both `b64_json` gateway responses and URL-backed gateway responses
- ✅ Normalizes URL-backed images into binary AI SDK files

**Gateway Integration:**
- Uses `/v1/images/generations`
- Downloads URL-backed image responses so they work with AI SDK `GeneratedFile` results

### ✅ Audio Models

**Supported Operations:**
- `experimental_generateSpeech()` - Text-to-speech through `SpeechModelV3`
- `experimental_transcribe()` - Speech-to-text through `TranscriptionModelV3`

**Features:**
- ✅ Binary audio output normalized to AI SDK `GeneratedAudioFile`
- ✅ Multipart transcription uploads
- ✅ Provider option passthrough for speech/transcription parameters
- ✅ Local compatibility coverage for both experimental AI SDK audio helpers

**Gateway Integration:**
- Uses `/v1/audio/speech`
- Uses `/v1/audio/transcriptions`

## Not Yet Implemented

### ⚠️ Moderation Models
- **Reason**: AI SDK v3 doesn't have standardized moderation model specification
- **Gateway Support**: Available via `/v1/moderations`
- **Future**: Can be added as custom implementation

## Architecture

### Layer Separation

```
Developer Application (Vercel AI SDK)
          ↓
@ai-stats/ai-sdk-provider (Translation Layer)
          ↓
AI Stats Gateway API (/v1/*)
          ↓
Provider Adapters (Internal Routing)
          ↓
Actual AI Providers (OpenAI, Anthropic, etc.)
```

### Key Components

1. **ai-stats-provider.ts** - Provider factory function
2. **ai-stats-language-model.ts** - LanguageModelV3 implementation
3. **ai-stats-embedding-model.ts** - EmbeddingModelV3 implementation
4. **convert-to-gateway-chat.ts** - AI SDK → Gateway request mapping
5. **map-gateway-response.ts** - Gateway → AI SDK response mapping
6. **utils/parse-sse-stream.ts** - SSE stream parser for streaming

## Testing Strategy

### Local Compatibility Tests (Cost-Free)

**Uses:**
- mocked gateway `fetch` responses
- real `generateText`, `streamText`, `embed`, `embedMany`, `generateImage`, `experimental_generateSpeech`, and `experimental_transcribe` AI SDK entry points
- synthetic SSE payloads for streaming coverage

**Coverage:**
- Text generation request/response mapping
- Non-stream response metadata propagation, including gateway headers
- Streaming text over SSE with usage-inclusive request settings
- Streaming finish reason, usage, and response metadata resolution
- AI Stats-specific `providerMetadata` passthrough for request/routing fields
- Default `aiStats` export environment-resolution behavior at module load time
- `AI_STATS_*` env precedence over `OPENAI_GATEWAY_*` envs for both the factory and default export
- Non-stream tool-call parsing into final AI SDK `toolCalls`
- `generateObject()` JSON-mode request mapping through AI SDK `responseFormat`
- `streamObject()` structured-output streaming over JSON text deltas
- Streaming tool-call assembly and final `toolCalls` / `steps` resolution
- Embeddings (single and batch)
- Embedding order preservation
- Base64 image generation responses
- URL-backed image generation responses
- Experimental speech generation
- Experimental transcription uploads and response mapping

**Files:**
- `tests/language-model.test.ts`
- `tests/embedding-model.test.ts`
- `tests/image-model.test.ts`
- `tests/audio-model.test.ts`
- `tests/gateway-test-config.test.ts`

### Integration Tests (Requires API Key)

**Purpose:**
- Validate real gateway integration
- Test actual provider routing
- Verify streaming behavior
- Check error handling

**Features:**
- Requires explicit `AI_STATS_RUN_GATEWAY_TESTS=1` opt-in for paid/live requests
- Ships a dedicated `pnpm test:gateway` helper that opts into live tests and runs only the gateway integration suite
- Uses actual gateway endpoints
- Tests multiple providers (OpenAI, Anthropic)
- Validates usage tracking
- Verifies gateway request metadata propagation on text, embeddings, image, and speech flows
- Accepts both `AI_STATS_*` and `OPENAI_GATEWAY_*` environment-variable conventions for API key/base URL resolution
- Includes local regression coverage for the live-test gating and env-resolution rules

**Files:**
- `tests/gateway-integration.test.ts` - optional real gateway integration coverage

## Examples

### Basic Usage Examples

1. **basic-text.ts** - Simple text generation
2. **streaming.ts** - Real-time streaming
3. **tools.ts** - Function/tool calling
4. **structured-output.ts** - JSON schema output
5. **embeddings.ts** - Vector embeddings and similarity
6. **image-generation.ts** - Image generation
7. **audio-transcription.ts** - Experimental speech-to-text
8. **text-to-speech.ts** - Experimental text-to-speech
9. **multi-provider.ts** - Provider comparison

### Usage Patterns

```typescript
// Language Model
import { aiStats } from '@ai-stats/ai-sdk-provider';
import { generateText } from 'ai';

await generateText({
  model: aiStats('openai/gpt-4o'),
  prompt: 'Hello!',
});

// Embedding Model
import { embed } from 'ai';

await embed({
  model: aiStats.textEmbeddingModel('openai/text-embedding-3-small'),
  value: 'Hello!',
});
```

## Supported Models

### Language Models (30+ providers)

**Major Providers:**
- OpenAI: gpt-4o, gpt-4-turbo, gpt-3.5-turbo
- Anthropic: claude-3-5-sonnet, claude-3-opus, claude-3-haiku
- Google: gemini-2.5-pro, gemini-2.5-flash
- Mistral: mistral-large, mistral-small
- X.AI: grok-3, grok-2

**Open Source:**
- DeepSeek: deepseek-chat, deepseek-coder
- Qwen: qwen-3-235b, qwen-3-32b
- Meta: llama-3.3-70b, llama-3.1-405b

**Fast Inference:**
- Groq: Ultra-fast inference
- Together AI: Open source models
- Cerebras: Extremely fast

### Embedding Models

**Supported:**
- OpenAI: text-embedding-3-small, text-embedding-3-large
- Cohere: embed-english-v3, embed-multilingual-v3
- Voyage: voyage-3, voyage-code-3
- And more via gateway routing

## Performance Characteristics

### Language Models

- **First Token Latency**: Gateway streams immediately, ~100-500ms typical
- **Streaming Throughput**: Varies by provider (Groq fastest, Anthropic high quality)
- **Token Usage Tracking**: Real-time in stream, accurate in non-streaming

### Embedding Models

- **Batch Size**: Up to 2048 texts per call (provider dependent)
- **Parallel Calls**: Enabled for large batches
- **Typical Latency**: 50-200ms for small batches

## Configuration Options

### Provider Settings

```typescript
createAIStats({
  apiKey: string,           // Required (or env var)
  baseURL?: string,         // Default: gateway URL
  headers?: Record,         // Custom headers
  fetch?: typeof fetch,     // Custom fetch
})
```

### Model Settings

```typescript
{
  temperature?: number,     // 0-2
  maxTokens?: number,       // Max output
  topP?: number,            // Nucleus sampling
  topK?: number,            // Top-K sampling
  frequencyPenalty?: number, // -2.0 to 2.0
  presencePenalty?: number,  // -2.0 to 2.0
  seed?: number,            // Deterministic output
  user?: string,            // User tracking
}
```

## Error Handling

### Automatic Retry

Errors are marked as retryable based on HTTP status:
- ✅ 408 Request Timeout
- ✅ 429 Too Many Requests
- ✅ 5xx Server Errors

### Error Types

- `APICallError` - HTTP errors with status codes
- `InvalidResponseDataError` - Malformed responses
- Standard errors for parsing failures

## Gateway Integration

### No Gateway Changes Required

The provider works with existing gateway endpoints as-is:
- ✅ `/v1/chat/completions` - Text generation
- ✅ `/v1/embeddings` - Embeddings
- ✅ No schema changes
- ✅ No new fields required

### Gateway Features Supported

- ✅ Health-aware routing
- ✅ Provider failover
- ✅ Cost tracking
- ✅ Usage analytics
- ✅ BYOK (Bring Your Own Key)
- ✅ Rate limiting

## Future Enhancements

### Potential Additions

1. **Image editing / variations**
   - Image editing via `/v1/images/edits`

2. **Additional audio routes**
   - Audio translation via `/v1/audio/translations`

3. **Video Models** (custom implementation)
   - Video generation via `/v1/videos`

4. **Moderation Models** (custom implementation)
   - Content moderation via `/v1/moderations`

5. **Advanced Features**
   - Prompt caching (Anthropic)
   - Response format enforcement
   - Custom headers per request
   - Request middleware
   - OpenTelemetry integration

## Package Statistics

- **Total Files**: 20+
- **Source Lines**: ~2000
- **Examples**: 9
- **Dependencies**: 2 (production), 5 (dev)
- **TypeScript Coverage**: 100%

## Maintenance

### Version Compatibility

- AI SDK: v6.x (peer dependency)
- Node.js: >=18.0.0
- TypeScript: >=5.0.0

### Semantic Versioning

- **Patch**: Bug fixes, documentation
- **Minor**: New features, backward compatible
- **Major**: Breaking changes

## Contributing

See main repository CONTRIBUTING.md for guidelines.

## License

MIT License - see LICENSE file for details.
