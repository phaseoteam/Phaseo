# Agentic Gateway Skill (External Integrators, Build-Complete)

This skill is the external-integration blueprint for building complete products on AI Stats Gateway.
It is intentionally API-consumer focused and excludes internal repo maintenance workflows.

## Scope

Use this skill when an agent needs to build or migrate:

- Full gateway clients (control + generation)
- Chat products using model discovery + Responses API
- Multimodal surfaces (text, embeddings, moderation, image, audio, video, OCR, music)
- OAuth-token or API-key based integrations

## What This Skill Now Guarantees

An agent following this file should have enough information to implement:

- A complete route client layer across control and generation surfaces
- A production-style chat app that discovers models and uses `/responses`
- Async job handling for video/music endpoints
- Retry/error handling and validation strategy across modalities

## Canonical Gateway Contract

- Base URL: `https://api.phaseo.app/v1`
- Auth header: `Authorization: Bearer <AI_STATS_API_KEY or OAuth access token>`
- Optional attribution:
  - `x-title: <app-name>`
  - `http-referer: <origin-url>`
- OpenAPI source of truth:
  - Repo copy: `apps/docs/openapi/v1/openapi.yaml`
  - Docs: `https://docs.ai-stats.phaseo.app`

## SDK Coverage + Fallback Rule

Agents should support published and unpublished/preview SDK conditions.

### SDK Matrix (Agent Awareness Required)

All of these SDKs exist and should be considered valid integration targets:

- TypeScript/JavaScript:
  - package: `@ai-stats/sdk`
  - local path: `packages/sdk/sdk-ts`
- Python:
  - package: `ai-stats-py-sdk`
  - local path: `packages/sdk/sdk-py`
- Go:
  - module: `github.com/AI-Stats/AI-Stats/packages/sdk/sdk-go`
  - local path: `packages/sdk/sdk-go`
- C#:
  - package: `AI.Stats.Sdk`
  - local path: `packages/sdk/sdk-csharp`
- Java:
  - artifact: `app.phaseo:ai-stats-sdk`
  - local path: `packages/sdk/sdk-java`
- PHP:
  - package: `ai-stats/php-sdk`
  - local path: `packages/sdk/sdk-php`
- Ruby:
  - gem: `ai_stats_sdk`
  - local path: `packages/sdk/sdk-ruby`
- Rust:
  - crate: `ai-stats-rust-sdk`
  - local path: `packages/sdk/sdk-rust`
- C++:
  - preview package: `@ai-stats/cpp-sdk`
  - local path: `packages/sdk/sdk-cpp`

### SDK Selection Guidance

- Prefer the language-native SDK when it is available and aligned with required surfaces.
- If a specific SDK does not yet expose a needed route, call that route via REST in the same integration.
- Do not block delivery on SDK publish status; use local SDK source or REST fallback.

If a target SDK is missing or behind:

1. Keep the same auth + header contract.
2. Fall back to REST for that surface.
3. Preserve response-shape compatibility for callers.

## Required Integration Architecture

Implement these modules (or equivalents):

1. `config`: base URL, auth source, attribution headers
2. `auth`: token provider (API key or OAuth), token refresh hook if OAuth
3. `gatewayClient`: typed request wrapper + retries + error normalization
4. `modelCatalog`: fetch + normalize model metadata from `/models` and `/gateway/models`
5. `capabilityRouter`: pick valid models by surface/modality
6. `chatOrchestrator`: Responses API conversation state (`previous_response_id`)
7. `asyncJobs`: poll/cancel/download flow for video/music jobs
8. `observability`: request IDs, latency, surface, model, status, retry counts

## Surface Map (Control + Generation)

### Control routes

- `GET /health`
- `GET /models`
- `GET /gateway/models`
- `GET /providers`
- `GET /generations?id=<request_id>` (request lookup)

### Generation routes

- Text:
  - `POST /responses`
  - `POST /chat/completions`
  - `POST /messages`
  - `GET /responses/ws` (realtime websocket mode)
- Classification/vector:
  - `POST /embeddings`
  - `POST /moderations`
- Audio:
  - `POST /audio/speech`
  - `POST /audio/transcriptions`
  - `POST /audio/translations`
- Image:
  - `POST /images/generations`
  - `POST /images/edits`
- Video:
  - `POST /videos`
  - `GET /videos/{video_id}`
  - `DELETE /videos/{video_id}`
  - `POST /videos/{video_id}/cancel`
  - `POST /videos/{video_id}/download_url`
  - `GET /videos/{video_id}/content`
- OCR:
  - `POST /ocr`
- Music:
  - `POST /music/generate`
  - `GET /music/generate/{music_id}`

## Model Discovery + Capability Routing

### Discovery sequence

1. Fetch `GET /models` for broad catalog.
2. Fetch `GET /gateway/models` for currently servable gateway set.
3. Normalize identifiers:
  - prioritize `id`
  - then `model_id`
  - then `model`
4. Deduplicate and keep a single canonical model list for UI and routing.

### Capability indexing

When metadata is present, index by:

- `endpoints`
- `input_types`
- `output_types`
- `params`

If metadata is incomplete, fallback to runtime probing:

1. try selected model on target surface
2. if 400/404 unsupported model/surface error, pick next candidate
3. cache success/failure per `(model, surface)` to avoid repeated failures

### Surface selection rule

For each operation, pick model candidates in this order:

1. user-selected model (if known-compatible)
2. cached previously-successful model for that surface
3. top discovered models that advertise the target surface
4. configured fallback default per surface

## Complete Chat App Blueprint (Models API + Responses API)

Implement this exact flow for a robust chat product:

1. On load:
  - fetch `/models` and `/gateway/models`
  - build model dropdown
2. On first user prompt:
  - call `POST /responses` with:
    - `model`
    - `input` (or `messages`, depending chosen response style)
3. On subsequent turns:
  - include `previous_response_id` from the prior successful response
4. Parse assistant text:
  - prefer `output_text`
  - fallback parse from `output[].content[].text`
  - fallback parse from chat-style `choices[0].message.content`
5. Handle model switch:
  - clear conversation state and `previous_response_id`

### Minimal non-streaming request

```json
{
  "model": "openai/gpt-5-nano-2025-08-07",
  "input": "Summarize this issue in one sentence."
}
```

### Follow-up request with continuity

```json
{
  "model": "openai/gpt-5-nano-2025-08-07",
  "input": "Now provide action items.",
  "previous_response_id": "resp_..."
}
```

## Per-Surface Runbooks (Minimum Integration Contracts)

### `/responses` (primary chat)

- Method: `POST`
- Required: `model`, `input` (or equivalent supported input format)
- Optional: `previous_response_id`
- Client behavior:
  - store `id` for conversation continuity
  - extract display text using parsing order defined above

### `/chat/completions` (OpenAI compatibility)

- Method: `POST`
- Required: `model`, `messages[]`
- Client behavior:
  - parse `choices[0].message.content`
  - support `stream: true` if app needs SSE flow

### `/messages` (Anthropic compatibility)

- Method: `POST`
- Required: `model`, Anthropic-style message payload
- Client behavior:
  - preserve response shape expected by Anthropic-compatible callers

### `/embeddings`

- Method: `POST`
- Required: `model`, `input`
- Client behavior:
  - validate vector length and deterministic shape for downstream storage

### `/moderations`

- Method: `POST`
- Required: `model`, `input`
- Client behavior:
  - convert category/scores to app-specific policy decision format

### `/audio/speech`

- Method: `POST`
- Required: speech model + text input fields per OpenAPI schema
- Response: audio binary (commonly `audio/mpeg`)
- Client behavior:
  - treat response as binary/stream, not JSON

### `/audio/transcriptions` and `/audio/translations`

- Method: `POST`
- Content type: `multipart/form-data`
- Required: audio file + model
- Client behavior:
  - multipart upload helper is required
  - parse JSON transcription/translation response

### `/images/generations`

- Method: `POST`
- Required: image model + prompt
- Client behavior:
  - handle URL and/or base64 response forms

### `/images/edits`

- Method: `POST`
- Content type: `multipart/form-data`
- Required: source image + prompt + model
- Client behavior:
  - multipart upload helper + image output handling

### `/ocr`

- Method: `POST`
- Required: OCR model + image input (`image_url` or schema-supported image payload)
- Client behavior:
  - normalize extracted text into app document model

### `/videos` async job lifecycle

- Create: `POST /videos`
- Status: `GET /videos/{video_id}`
- Cancel: `POST /videos/{video_id}/cancel`
- Download URL: `POST /videos/{video_id}/download_url`
- Binary content: `GET /videos/{video_id}/content`
- Delete tombstone: `DELETE /videos/{video_id}`

Client behavior:

1. create job
2. poll status every ~20 seconds until terminal state
3. on success: request signed download URL or stream content
4. support cancel for in-progress jobs

### `/music/generate` async lifecycle

- Create: `POST /music/generate`
- Status: `GET /music/generate/{music_id}`

Client behavior:

1. create job
2. poll status until terminal state
3. persist final asset metadata in app storage

## Streaming + Realtime Guidance

- For standard app streaming, prefer compatibility route behavior your client already supports.
- For websocket realtime responses, use `GET /responses/ws` and handle event stream lifecycle:
  - connect
  - send request event(s)
  - consume incremental server events
  - enforce one in-flight request per connection unless spec indicates otherwise

## Error Handling + Retry Policy

### Retry classes

- Retry with exponential backoff + jitter:
  - `429`
  - `5xx`
  - transient network failures
- Do not retry blindly:
  - `400` schema/request errors
  - `401/403` auth errors (refresh/re-auth first)
  - `404` wrong route/resource/model ID

### Normalized app error fields

At integration boundary, normalize to:

- `surface`
- `status`
- `code` (if provided)
- `message`
- `request_id` (if present)
- `retryable` boolean

## Security and Data Handling Rules

- Never hardcode API keys or OAuth secrets.
- Keep keys/tokens server-side for web apps; avoid direct browser exposure.
- Do not log full sensitive prompts or user-uploaded raw files by default.
- Redact auth headers and key-like values in logs and telemetry.

## Validation Matrix (Must Pass)

### Control

1. `GET /health` success
2. `GET /models` success
3. `GET /gateway/models` success
4. Model normalization produces non-empty list

### Text

5. `POST /responses` success with selected model
6. Follow-up request with `previous_response_id` success
7. `POST /chat/completions` success for compatibility path

### Additional modality checks (as in scope)

8. Embeddings success
9. Moderations success
10. At least one image surface success
11. At least one audio surface success
12. OCR success
13. Video create + status poll path works
14. Music create + status poll path works

## Definition of Done

- Integration uses external gateway contract (`https://api.phaseo.app/v1`) correctly.
- All in-scope control + generation surfaces are wired behind one coherent client layer.
- Chat app supports model discovery + Responses API conversation continuity.
- Async surfaces (video/music) include creation + polling and terminal handling.
- Error handling, retry policy, and security controls are implemented.
- REST fallback path exists where SDK/runtime coverage is incomplete.
