# AI Stats AI SDK Provider - Implementation Summary

## Overview

`@ai-stats/ai-sdk-provider` is a Vercel AI SDK v6 provider for AI Stats Gateway.
It routes model IDs in `provider/model` format through `https://api.phaseo.app/v1`.

## Implemented Surface

### Language models
- Interface: `LanguageModelV3`
- Endpoint: `/v1/chat/completions`
- Supports:
  - `generateText`, `streamText`
  - `generateObject`, `streamObject` (`response_format: json_object`)
  - tool/function calling
  - streaming usage via `stream_options.include_usage`
  - multimodal text + image chat content
  - provider option passthrough and per-call headers

### Embeddings
- Interface: `EmbeddingModelV3`
- Endpoint: `/v1/embeddings`
- Supports:
  - `embed`, `embedMany`
  - batch embeddings and usage mapping

### Image generation
- Interface: `ImageModelV3`
- Endpoint: `/v1/images/generations`

### Audio
- Speech (TTS)
  - Interface: `SpeechModelV3`
  - Endpoint: `/v1/audio/speech`
- Transcription (STT)
  - Interface: `TranscriptionModelV3`
  - Endpoint: `/v1/audio/transcriptions`

## Not Yet Implemented

### Video generation
- Gateway endpoint exists (`/v1/video/generations`)
- Provider does not currently expose a dedicated video model interface

### Moderation
- Gateway endpoint exists (`/v1/moderations`)
- Provider does not currently expose a dedicated moderation model interface

## Core Files

1. `src/ai-stats-provider.ts` - provider factory and model adapters
2. `src/ai-stats-language-model.ts` - chat generation/streaming
3. `src/convert-to-gateway-chat.ts` - AI SDK prompt/options to gateway payload
4. `src/map-gateway-response.ts` - gateway response mapping
5. `src/ai-stats-embedding-model.ts` - embeddings
6. `src/ai-stats-image-model.ts` - image generation
7. `src/ai-stats-speech-model.ts` - text-to-speech
8. `src/ai-stats-transcription-model.ts` - speech-to-text

## Testing

### Unit tests
- `tests/convert-to-gateway-chat.test.ts`
  - settings fallback behavior
  - call option precedence
  - provider options passthrough
  - image content conversion
  - tool mapping and tool choice mapping

### Integration and manual checks
- `tests/gateway-integration.test.ts` - live gateway checks (key required)
- `tests/manual-v6-check.ts` - manual end-to-end sanity script

## Notes

- Model availability is intentionally dynamic: callers pass model IDs directly.
- For latest model catalog, use gateway `GET /v1/models` at runtime instead of hardcoding lists in app code.
