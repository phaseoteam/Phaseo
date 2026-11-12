# Non-text endpoints, routing side effects and upstream headers: traced audit

Companion to `AUDIT.md`: the parts the simulator does not drive (non-text endpoints, routing and failover, headers). Base: `origin/main` at 6551de1fa3. Read-only review on 2026-10-17. All paths below are relative to `apps/api/src` unless they start with `packages/`. Nothing was run and no live calls were made.

Pricing evidence came from the catalogue's archived JSON price rows, which have since been removed; the database is the only source of catalogue rows, and the simulator now reads it directly (`src/catalogue.ts`). Every finding that depends on a price row needs a database readback (listed in section 4) before it is treated as a production fact.

## 1. Summary

- **Critical:** successful text-to-speech from OpenAI, Azure, Together, Morpheus, DeepInfra, MiniMax, StepFun, Novita and OVHcloud is never priced, charged or logged. These executors return `kind: "stream"`, but speech requests never set `ctx.stream`, so `finalizeRequest` falls through to a raw passthrough. That path does no pricing, no success audit and no quota settlement.
- **High:** any exception thrown after a provider has already returned 2xx (most often `computeBill` inside an image, OCR or speech adapter) is treated as an ordinary attempt failure. The attempt loop then sends the same request to the next provider, so Phaseo pays twice. Only `video.generate` is protected.
- **High:** synchronous media requests whose configured meter does not match are billed at $0 with no alert. Examples are grok-imagine-image without a `resolution`, and Together Whisper / Azure MAI Transcribe, which are priced on `input_audio_minutes` that nothing produces. The engine only throws when at least one other line was priced. Batch and video have zero-cost guards; synchronous routes do not.
- **High:** speech-to-text is billed on file-size guesses (it assumes 128 kbit/s MP3 and 96 kbit/s Opus) even when OpenAI returns authoritative `usage.seconds` or `input_token_details.audio_tokens`. Voice-note audio is undercharged by roughly 3x.
- **Medium:** the passthrough path forwards every upstream response header, including the shared account's rate-limit headers, `openai-organization` and `set-cookie`. Gateway-generated 400 and 502 responses trigger failover, show up as 502 to the client, and count against provider health. Client `anthropic-beta` headers are dropped. Fireworks images go to an endpoint Fireworks does not document. Cohere rerank is billed per request rather than per search unit.
- Batch, video and realtime are guarded carefully (reservations, quarantine, idempotency keys, `stopFallback`, zero-cost alerts). I found only low-severity gaps there.
- Confirms another workstream's finding: the cache-meter `pricing_rule_missing` throw is at `pipeline/pricing/engine.ts:888-889`. In non-text adapters the same throw happens inside the executor, so it also triggers the double-dispatch in H1.

## 2. Findings ranked by severity

### Critical

#### C1. TTS responses delivered as `kind: "stream"` bypass billing, audit and quota settlement
- **Evidence:**
  - Executors return `kind: "stream"` on every 2xx:
    - `providers/openai/endpoints/audio-speech.ts:414` (binary/blob path) and `:328` (`stream_format: "sse"`). This adapter is shared by `openai`, `openai-eu`, `azure` (`executors/_shared/non-text/adapter-bridge.ts:619-624`) and `together`/`morpheus` (`adapter-bridge.ts:676-679`).
    - `providers/deepinfra/endpoints/audio-speech.ts:46`
    - `providers/minimax/endpoints/audio-speech.ts:169,191`
    - `providers/stepfun/audio-speech.ts:39`
    - `executors/novita/audio-speech/index.ts:48`
    - `executors/ovhcloud/audio-speech/index.ts:26`
  - The bridge passes the stream kind through: `executors/_shared/non-text/adapter-bridge.ts:901-911`.
  - `ctx.stream` is `Boolean(body.stream)` (`pipeline/before/guards.ts:441`). `AudioSpeechSchema` has no `stream` field (`core/schemas.ts:1628-1657`), so it is always `false` for speech.
  - `finalizeRequest` skips the streaming branch (`pipeline/after/index.ts:349`). `result.normalized` is only set for `kind === "completed"` (`pipeline/surfaces/non-text.ts:575-580`), so the non-stream branch is also skipped (`pipeline/after/index.ts:368`). The request then lands in `passthroughOk` → `handlePassthroughFallback(result.upstream)` (`pipeline/after/index.ts:373-375`).
  - `passthrough` is `new Response(upstream.body, { headers: upstream.headers })` (`pipeline/after/streaming.ts:22-27`).
  - On this path the following are never reached:
    - pricing (`calculatePricing`, `pipeline/after/index.ts:480`)
    - `recordUsageAndChargeOnce`
    - `handleSuccessAudit` (`pipeline/after/index.ts:249`)
    - `recordManagedProviderTokensOnce` (`pipeline/after/index.ts:241`)
- **Scenario:**
  - `POST /v1/audio/speech {"model":"openai/gpt-4o-mini-tts","input":"…","voice":"alloy"}`. The client gets audio, but no cost is recorded, no request row is written and the provider-quota estimate charged at `pipeline/execute/index.ts:950-956` is never settled.
  - With `stream_format: "sse"` on OpenAI, `result.upstream` is the original `res`, whose body was consumed by `res.body.tee()` (`audio-speech.ts:325-327`). `passthrough` then builds a Response from a locked stream. Per the Fetch spec that throws, so the client gets a 500 after OpenAI has already charged. This last step is spec-based; I did not execute it.
  - Speech providers that return `completed` (ElevenLabs, xAI, Xiaomi, Google, GMI Cloud) are not affected.
- **Impact:** all managed TTS spend on these nine providers is unrecovered and invisible in usage logs and analytics.
- **How known:** **traced**
- **Fix:**
  - Option 1: in `adapter-bridge.ts` (and the Novita and OVHcloud executors), when `endpoint === "audio.speech"` and the result is `kind: "stream"`, read the body to bytes, await `usageFinalizer()`, and return `completed` with `audio_base64`. The after stage already handles this at `pipeline/after/index.ts:612-628`.
  - Option 2: add a binary-stream finaliser in `finalizeRequest` that prices `usageFinalizer()` output before passthrough.
  - Either way, also stop forwarding raw upstream headers (see M1). Add a pipeline-level test that asserts a charge for a `kind: "stream"` speech result.
- **Effort:** M

### High

#### H1. Exceptions after a successful upstream response cause failover and a second paid generation
- **Evidence:**
  - The catch block for executor exceptions returns `{ ok: false, stopFallback: ctx.capability === "video.generate" }` (`pipeline/execute/index.ts:1398-1466`, return at `:1465`). The attempt loop then moves to the next credential/provider (`:637-689`).
  - Nothing checks whether the upstream already succeeded, even though `upstreamTracker.snapshot().upstreamRequestCount` is available (used at `:1401`).
  - Adapters price inside the executor, after the provider has returned 2xx:
    - `providers/openai/endpoints/images.ts:278` (and `:228` for streams)
    - `providers/x-ai/endpoints/images-edit.ts:77`
    - `providers/google-ai-studio/endpoints/images.ts:261`
    - `providers/byteplus/endpoints/images.ts:136`
    - `providers/minimax/endpoints/images.ts:178`
    - `providers/elevenlabs/endpoints/audio-speech.ts:272`
    - `providers/mistral/endpoints/ocr.ts:98`
    - `providers/cohere/endpoints/parse.ts:52`
    - `providers/elevenlabs/endpoints/music-generate.ts:208,234`
  - `computeBill` throws `pricing_rule_missing` (`pipeline/pricing/engine.ts:889,892`), `pricing_invalid_unit_price` and similar.
- **Scenario:**
  - `POST /v1/images/edits` for `spacex-ai/grok-imagine-image` without `resolution`.
  - `providers/x-ai/endpoints/images-edit.ts:33` leaves `canonicalResolution` undefined. `buildImagePricingRequestOptions` only defaults resolution for the 2.0 model (`core/image-request-options.ts:161-166`).
  - The fixture `spacex-ai/spacex-ai-grok-imagine-image/image.edit` prices `input_image` unconditionally but `output_image` only for `resolution` 1k or 2k. So `input_image` is priced (lines > 0) and `output_image` is unmatched, which throws at `engine.ts:892`.
  - xAI has already generated and billed the image. The gateway records an `error` attempt and calls the next candidate (another xAI alias or BYOK key), which generates again. If nothing else succeeds, the client gets a 502 and the images are lost.
  - The same shape applies to any adapter-level pricing or response-mapping throw, and to response-body read failures after headers.
- **How known:** **traced**
- **Fix:**
  - In the catch block, set `stopFallback: true` (or return a terminal failure) whenever `upstreamTracker.snapshot().upstreamRequestCount > 0` and the selected response was 2xx.
  - Separately, move adapter-level `computeBill` calls into the after stage (keep the usage meters, drop in-executor pricing), as text executors already do.
- **Effort:** M

#### H2. Synchronous media priced at $0 when a configured meter does not match and nothing else is priced
- **Evidence:**
  - A meter with no matching rule is only queued as an error when some rule for that meter exists (`pipeline/pricing/engine.ts:791-806`).
  - The engine throws for unmatched configured meters only when `lines.length > 0` (`engine.ts:891-893`). Otherwise it returns cost 0 (`engine.ts:895-910`).
  - Sync paths have no zero-cost guard. Only batch (`core/batch-finalization.ts:1118-1125`) and video (`core/video-finalization.ts:805-812`) flag `unexpected_zero_cost`.
- **Scenarios (against the archived fixtures):**
  - `spacex-ai/grok-imagine-image` image.generate prices `output_image` only when `image_params.resolution = "1k"` (fixture). A request without `resolution`/`size` produces no `image_params.resolution` (`core/image-request-options.ts:162-166`), so it is billed $0. The same applies to `grok-imagine-image-quality` and `-pro` (rules only for 1k/2k), and to 2.0 with `quality: "high"`.
  - `together/openai-whisper-large-v3` (transcription and translations) and `azure/microsoft-mai-transcribe-1/1.5` are priced on `input_audio_minutes`. The OpenAI transcription adapter only emits `input_audio_seconds`/`input_audio_tokens` (`providers/openai/endpoints/audio-transcription-usage.ts:161-171`). `input_audio_minutes` is only produced by Cloudflare, Mistral and realtime (grep: `executors/cloudflare/audio-transcription/index.ts:41`, `providers/mistral/endpoints/audio-transcription.ts:30`, `core/realtime-sessions.ts:668`), and `splitUsage` does not derive it (`engine.ts:185-446`). Result: $0.
  - `deepinfra/hexgrad-kokoro-82m` audio.speech has its only rule on `pricing_plan: "default"`. `derivePricingPlan` returns `standard` (`pipeline/after/pricing.ts:42-61`), and plan fallback only runs when the requested plan is not `standard` (`engine.ts:720`), so it is $0. This is currently masked by C1.
- **How known:** **traced** (the code path is certain; whether production price rows match the fixtures needs a database readback)
- **Fix:**
  - In `calculatePricing`, raise an operational alert or fail closed when the card has any paid rule but `lines` is empty.
  - Derive `input_audio_minutes` from `input_audio_seconds` in `splitUsage`.
  - Default xAI image resolution to `1k` for all Grok Imagine models.
  - Fix the `default` plan rows.
- **Effort:** S-M

#### H3. Speech-to-text billed on file-size estimates while authoritative usage is discarded
- **Evidence:**
  - `normalizeAudioTextUsage` keeps only `seconds`/`duration` (`providers/openai/endpoints/audio-transcription.ts:54-66`).
  - `mergeSpeechToTextUsage` takes `input_audio_tokens` and `output_text_tokens` only from keys OpenAI never sends under those names, and otherwise falls back to the estimate (`audio-transcription-usage.ts:120-143`).
  - The estimate converts duration from bytes using fixed bitrates: MP3 16 kB/s, Opus/WebM/Ogg 12 kB/s, AAC/M4A 20 kB/s (`audio-transcription-usage.ts:72-90`). It returns undefined for unknown MIME types without a filename (`:113-117`); the default filename is `"audio"` (`audio-transcription.ts:297-300`).
  - `input_audio_tokens` = seconds × 40 (`audio-transcription-usage.ts:155-157`).
  - Output tokens = transcript characters / 4 (`:13-16,153`).
  - Applied to every non-stream and stream response (`audio-transcription.ts:357-363,379-390`).
- **Scenarios:**
  - A browser `MediaRecorder` WebM/Opus voice note at about 32 kbit/s (4 kB/s) is estimated at one third of its real length, so `openai/gpt-4o-transcribe` and `whisper-1` (both priced on `input_audio_tokens` in the fixtures) are billed about 1/3.
  - A file with no recognised MIME type gets no audio meter at all; only the estimated output text is billed.
  - OpenAI returns `usage.input_token_details.audio_tokens` and `output_tokens` (GPT-4o transcribe) or `usage.seconds` (Whisper). These are ignored for pricing.
  - Groq and DeepInfra (seconds-priced) also fall back to the estimate when the JSON response has no duration. DeepInfra `input_length_ms` is used (`audio-transcription.ts:376-378`).
- **How known:** **traced** (the exact size of the undercharge needs a live comparison, see section 4)
- **Fix:**
  - Map `input_token_details.audio_tokens` → `input_audio_tokens`, `input_token_details.text_tokens` → `input_text_tokens` and `output_tokens` → `output_text_tokens`.
  - For Whisper, derive `input_audio_tokens` from reported `seconds` rather than file size.
  - Use estimates only as a flagged fallback (`usage_estimated: true`).
- **Effort:** S

### Medium

#### M1. Passthrough forwards all upstream response headers to the client
- **Evidence:**
  - `pipeline/after/streaming.ts:22-27` copies `upstream.headers` verbatim. It is used by `pipeline/after/index.ts:373-375` for `audio.speech`, `audio.transcription`, `audio.translations`, `video.generation` and `images.edits` whenever no normalised payload exists, which is every C1 request.
  - The rest of the gateway deliberately allowlists only `Retry-After`, and quota headers only for BYOK (`pipeline/upstream-rate-limit-headers.ts:54-72`). The request-side sanitiser `pipeline/http/sanitize-headers.ts:10-22` is not applied to responses.
- **Impact:** managed-key responses leak the shared OpenAI/DeepInfra/MiniMax account's `x-ratelimit-*` capacity, `openai-organization`/`openai-project`, provider `set-cookie` and `cf-ray` to customers.
- **How known:** **traced**
- **Fix:** build a fresh `Headers` with `Content-Type`, `Content-Length`, `Cache-Control: no-store` and the gateway timing header.
- **Effort:** S

#### M2. Gateway-generated errors fail over, surface as 502, and are counted against provider health
- **Evidence:**
  - Local validation responses are non-terminal `completed` results with 400. Examples:
    - `providers/openai/endpoints/audio-speech.ts:263` (invalid voice)
    - `executors/google/shared/embeddings.ts:6-14`
    - `executors/openai/embeddings/index.ts:22-48`
    - `providers/openai/endpoints/audio-transcription.ts:120-293`
  - The non-2xx branch only stops for `terminal` or video (`pipeline/execute/index.ts:1299-1313`), so the loop tries every other provider with the same bad request. `guardAllFailed` then returns `upstream_error`, which is HTTP 502 (`pipeline/execute/guards.ts:631`, `pipeline/execute/http.ts:31`) outside stealth mode. SDKs retry 502s.
  - Thrown validation errors (`executors/google-ai-studio/embeddings/index.ts:82-84`; Perplexity checks at `executors/openai/embeddings/index.ts:218-247`) take the same route via the catch block.
  - Synthetic 502s produced after a paid provider success are scored as provider failures by `classifyProviderHealthImpact` (`pipeline/execute/health.ts:96`):
    - OpenAI speech `upstream_usage_missing` (`audio-speech.ts:348-365,383-400`)
    - GMI Cloud speech output missing (`executors/gmicloud/audio-speech/index.ts:49`)
    - video `invalid_upstream_response` / `async_job_persistence_failed` (`adapter-bridge.ts:942-951,989-998`)
  - These synthetic 502s also fail over. For speech that means a second paid TTS generation.
- **How known:** **traced**
- **Fix:**
  - Set `terminal: true, localClientError: true` on local validation results (Novita already does this, `executors/novita/audio-speech/index.ts:22,40`).
  - Make post-success synthetic errors terminal and `healthImpact: "neutral"`.
- **Effort:** S

#### M3. Client `anthropic-beta` headers are dropped
- **Evidence:** the Anthropic executor builds `anthropic-beta` only from body features (fast mode, web fetch, advisor, files) (`executors/anthropic/text-generate/index.ts:209-220`). A grep of `routes`, `protocols`, `pipeline` and `core` finds no reader of the client's `anthropic-beta` header.
- **Scenario:** an Anthropic SDK client sends `anthropic-beta: <beta>` to `/v1/messages`. The upstream never sees it, so the feature is silently off or the request fails on a beta-only field.
- **How known:** **traced** (which betas still matter on current models needs a live call)
- **Fix:** forward an allowlisted set of client betas, merged with computed betas; reject unknown ones explicitly.
- **Effort:** S

#### M4. Fireworks image generation targets an undocumented path
- **Evidence:**
  - `fireworks` has `"image.generate": nonTextAdapterExecutor` (`executors/index.ts:467`). This falls to `openaiImages.exec` because Fireworks is OpenAI-compatible (`adapter-bridge.ts:640-643`). It posts to `https://api.fireworks.ai/inference/v1/images/generations` (`providers/fireworks/config.ts:3-10`, `providers/openai/endpoints/images.ts:199`).
  - Fireworks documents FLUX at `/inference/v1/workflows/accounts/fireworks/models/<model>/text_to_image`, which returns image bytes. A fixture prices `fireworks/black-forest-labs-flux-1-schnell`.
- **How known:** **needs-live**
- **Fix:** add a Fireworks image adapter, or disable the route.
- **Effort:** M

#### M5. Cohere rerank billed per request, not per search unit
- **Evidence:**
  - The fixtures `cohere/cohere-rerank-v3.5|v4.0-*` price `requests@0.002`.
  - The executor always emits `requests: 1` and carries `search_units` only as an unpriced extra (`executors/openai/rerank/index.ts:210-225`).
  - Cohere bills one search unit per query with up to 100 documents, and long documents are chunked.
- **Scenario:** one rerank over 1,000 documents costs Phaseo 10 units but bills the customer 1.
- **How known:** **traced** (code and fixture; the unit rule is from Cohere's pricing docs)
- **Fix:** price `search_units` (fall back to `requests` when absent).
- **Effort:** S

#### M6. Image streaming finaliser never sets `output_image` for non-GPT-image models
- **Evidence:**
  - For `stream: true`, usage is only what the SSE frames carry, plus `requests` and `image_pixels` (`providers/openai/endpoints/images.ts:218-236`).
  - Unlike the non-stream branch (`:269-271`), it never sets `output_image`.
  - If a provider ignores `stream` and returns JSON, or a stream ends before the completion frame, usage is `{}`. With an `output_image` card that is $0 (see H2).
- **How known:** **needs-live** (whether xAI/Together/Fireworks accept `stream` on images)
- **Fix:** reject `stream` for providers or models without image streaming, and set `output_image` from the request `n` in the finaliser.
- **Effort:** S

### Low

- **L1. Client `user` sent to every OpenAI-compatible image, edit and speech provider.**
  - Evidence: `providers/openai/endpoints/images.ts:120`; `adapter-bridge.ts:201,245,274`. Embeddings strip it only for Cohere, Together, Novita, Perplexity and Voyage (`executors/openai/embeddings/index.ts:247-331`).
  - Risk: leaks an end-user identifier to third-party hosts, and strict schemas may 400.
  - **traced**. Fix: forward `user` only to providers that document it. S.
- **L2. Google AI Studio embeddings can be billed $0.**
  - Evidence: if `embedContent` returns no usage and the `countTokens` preflight fails, `bill.usage` is `{requests:1}` only (`executors/google-ai-studio/embeddings/index.ts:125-135,153-156`). That is $0 on token-priced cards.
  - **traced**. Fix: estimate from characters and flag it. S.
- **L3. TTS `input_characters` counts UTF-16 code units, not characters.**
  - Evidence: `string.length` is used (`adapter-bridge.ts:460-462`; `providers/openai/endpoints/audio-speech.ts:409`), so emoji and astral CJK count twice.
  - **traced**. Fix: `[...input].length`. S.
- **L4. Realtime ignores image input tokens.**
  - Evidence: `input_token_details.image_tokens` is not mapped (`core/realtime-sessions.ts:608-679`). When only `cached_tokens` is present, all of it is subtracted from text (`:631-634,656`).
  - **traced**. Fix: map image tokens and cached audio. S.
- **L5. Upstage OCR is $0 when `numBilledPages`/`usage.pages` is missing.**
  - Evidence: the executor relies on those fields (`executors/upstage/ocr/index.ts:47-48`).
  - **needs-live**. S.
- **L6. Google Lyria music is $0 when `usageMetadata` is absent.**
  - Evidence: the request meter comes only from token totals (`core/usage-normalization.ts:101-113`). The executor leaves `bill.usage` undefined (`executors/google/music-generate/index.ts:400-406`) and IR usage comes from `usageMetadata` (`:307`).
  - **needs-live**. Fix: set `requests: 1`. S.
- **L7. Attempt chains are unbounded.**
  - Evidence: `calculateMaxTries` returns all candidates (`pipeline/execute/utils.ts:31-36`), despite the "failover up to 5" comment (`pipeline/execute/index.ts:610`).
  - Risk: a systemic provider-side 5xx on a popular model fans out across every route.
  - **traced**. Fix: cap at 5. S.
- **L8. `hasAlternateCandidates` can be wrong.**
  - Evidence: it is computed from plan length (`pipeline/execute/index.ts:651`), not from viable candidates. If later entries are `blocked`/`no_pricing`, the OpenAI-compat text executor fails over instead of retrying (`executors/_shared/text-generate/openai-compat/index.ts:191`) and there is nothing to fail over to.
  - **traced**. S.
- **L9. Fixture `match` rules use `key`/`operator`, which the engine ignores.**
  - Evidence: the engine reads `cond.path`/`cond.op` (`pipeline/pricing/conditions.ts:38-42`), but some fixture rules use `key`/`operator` (Upstage `information-extract`, `document-parse` enhanced).
  - This is unreachable today because the Upstage adapter accepts only `ocr`/`document-parse` standard (`executors/upstage/ocr/index.ts:10-12`). The same row shape in the database would never match.
  - **needs-live** (database readback). S.
- **L10. Provider quota estimates leak on the C1 passthrough path.**
  - Evidence: the estimate is charged at `pipeline/execute/index.ts:950-956` and settled only at `pipeline/after/index.ts:241`, `pipeline/after/stream.ts:559,691,752,830`. It is never settled when the request goes through passthrough.
  - Fixed by C1.

### Confirmations of the other workstream
- `pricing_rule_missing` for unpriced cache meters: `pipeline/pricing/engine.ts:798-804,888-889`. For text this throws in the after stage, which returns `nonstream_finalization_failed` 500 after delivery (`pipeline/after/index.ts:650-663`). For non-text adapters the same throw occurs in the executor and triggers H1.
- Bedrock Claude via Mantle: `executors/amazon-bedrock/text-generate/index.ts:86-95` (sends `anthropic-version` as a header to `buildMantleMessagesUrl`). This is consistent with the reported issue.

## 3. Per-family tables

Verdict key: works / partial / broken / unknown. "Fixture" means the archived price row.

### Embeddings
| Provider(s) | Request mapping | Usage / pricing | Errors | Verdict |
|---|---|---|---|---|
| OpenAI, Azure, Baidu, Upstage, Alibaba(-Cloud), Qwen, Tensorix, Cloudflare, Morpheus, Nebius, Parasail, Phala, Perplexity, Fireworks, DeepInfra, Novita (`executors/openai/embeddings`) | Per-provider field stripping (`index.ts:209-362`). `user` kept for most. Sends `Idempotency-Key: requestId` (`:420-423`) | `input_text_tokens`, `embedding_tokens`, `total_tokens` from `usage` (`:364-396`). Matches the fixtures (`input_text_tokens`/`output_text_tokens`) | Local checks return non-terminal 400 or throw, which fails over and gives 502 (M2) | works (minor M2) |
| Voyage | `output_dimension`, `input_type`, multimodal/contextual endpoints (`:304-359,413-419`) | Image/video pixels mapped to `_ext` (`:380-394`). No fixture | as above | unknown (no price row) |
| Mistral, Cohere, Together | Mistral `output_dimension`/`output_dtype` (`:255-267`); Cohere/Together strip fields (`:269-280`) | token usage | as above | works |
| Google AI Studio | `embedContent`/`batchEmbedContents`; key in URL query (redacted in logs, `lib/security/sanitizeUrl.ts:1-28`) | `usageMetadata`, else `countTokens` preflight. $0 if both missing (L2) | taskType misuse throws → failover/502 | partial |
| Google Vertex | Gemini Embedding 2 only, one input (`google-vertex/embeddings/index.ts:24-30`) | `requests` + `usageMetadata` | Local 400 non-terminal | unknown (no fixture; `:embedContent` path needs a live call) |

### Images (generate / edit)
| Provider | Request mapping | Usage / pricing | Errors | Verdict |
|---|---|---|---|---|
| OpenAI / Azure (gpt-image) | `mapGatewayToOpenAIImages` (`images.ts:87-124`), forwards `user` | Token meters via `normalizeOpenAIImageTokenUsage` (`core/image-request-options.ts:91-108`). Matches the fixtures | In-adapter `computeBill` throw → H1 | partial (H1) |
| xAI / spacex-ai | `aspect_ratio`/`resolution` (`images.ts:102-105`); edits in `x-ai/endpoints/images-edit.ts` | `output_image` only matched with resolution. No default except 2.0 → $0 (H2); edit throws (H1) | as above | broken for grok-imagine-image / -quality / -pro without resolution |
| Together | width/height/steps etc. (`images.ts:91-101`) | `image_pixels` matches fixture (`images.ts:126-137,272-273`) | — | works |
| Fireworks | OpenAI path to `/inference/v1/images/generations` | `output_image` | — | broken (needs-live, M4) |
| Google AI Studio, BytePlus/ByteDance Seed, MiniMax, StepFun | dedicated adapters (`adapter-bridge.ts:629-639`) | in-adapter `computeBill` | H1 | partial |
| BFL, DeepInfra, Alibaba, ModelScope, OVHcloud, GMI Cloud, Baidu, Cloudflare, Novita | dedicated executors (not deep-read) | BFL credits / `deepinfra_cost_usd` meters exist in `KNOWN_METERS` (`engine.ts:23`) | — | unknown |

### Audio speech (TTS)
| Provider | Request mapping | Usage / pricing | Errors | Verdict |
|---|---|---|---|---|
| OpenAI / Azure / Together / Morpheus | Forces `stream_format: "sse"` for OpenAI to get usage (`audio-speech.ts:301-309`) | Usage parsed, but `kind: "stream"` → **unbilled** (C1). SSE requested by client → 500 after charge | 400s non-terminal (M2); `upstream_usage_missing` 502 fails over after charge | broken |
| DeepInfra, MiniMax, StepFun, Novita, OVHcloud | dedicated | `kind: "stream"` → **unbilled** (C1); kokoro row on plan `default` (H2) | — | broken |
| ElevenLabs, xAI, Xiaomi, Google AI Studio, GMI Cloud | dedicated | `completed`; `input_characters` or tokens; ElevenLabs prices in-adapter (H1) | GMI synthetic 502 counted against health (M2) | partial / works |

### Audio transcription / translation
| Provider | Request mapping | Usage / pricing | Errors | Verdict |
|---|---|---|---|---|
| OpenAI (whisper-1, gpt-4o-*-transcribe) | multipart, per-model validation (`audio-transcription.ts:110-341`) | File-size estimates, upstream usage ignored (H3) | Local 400 non-terminal (M2) | partial (under-billing) |
| Azure MAI, Together Whisper | via OpenAI adapter | `input_audio_minutes` never produced → $0 (H2) | — | broken |
| Groq, DeepInfra, OVHcloud, Scaleway | via OpenAI adapter with provider checks | seconds from estimate; DeepInfra uses `input_length_ms` | — | partial |
| Mistral, ElevenLabs, xAI, Xiaomi, Meta, Friendli, StepFun, Cloudflare, Google AI Studio/Vertex | dedicated | Mistral emits seconds+minutes (`mistral/endpoints/audio-transcription.ts:30-37`); others not deep-read | — | unknown |
| Translations: OpenAI, Groq, Together | `audio-translation.ts` (147 lines, not deep-read) | Together card on minutes → $0 (H2) | — | partial |

### Batch
| Provider | Request mapping | Usage / pricing | Errors | Verdict |
|---|---|---|---|---|
| OpenAI, Mistral, Moonshot, xAI, Together, Google Vertex, others in `core/batch-provider-adapters.ts` | Policy validation per row, metadata stamping (`routes/v1/data/batches.ts:2159-2320`) | Max-cost wallet hold before submit (`:2203-2236`); zero-cost and unpriced-row guards (`core/batch-finalization.ts:637-719,886,1118`) | `Idempotency-Key: phaseo:<batchId>` on create (`:2407-2414`); unknown outcomes quarantined, not released (`:2431-2462`); xAI follow-up failure cancels and keeps the hold (`:2465-2505`) | works (not exhaustively traced) |

### Video
| Provider | Request mapping | Usage / pricing | Errors | Verdict |
|---|---|---|---|---|
| All `video.generate` executors | provider option selection (`pipeline/execute/index.ts:932-934`) | Reservation before submit (`adapter-bridge.ts:765-858`); zero-cost guard (`core/video-finalization.ts:805-812`) | No retry (`pipeline/execute/index.ts:1011`); `stopFallback` after dispatch or on 5xx (`:1305-1313,1465`); synthetic 502s count against health (M2) | works |

### Realtime
| Provider | Request mapping | Usage / pricing | Errors | Verdict |
|---|---|---|---|---|
| OpenAI, xAI, Google AI Studio | session create plus relay DO (`core/realtime-sessions.ts:469-578`) | Token/seconds normalisation (`:595-680`); requires a price card (`:722-728`); meter presence assert (`:696-720`); xAI exempt from the token-meter assert (`:701`) | holds/extend/settle and reconciliation job (`:986-1240,1303`) | partial (L4) |

### Moderations, rerank, OCR/parse, music
| Family / provider | Request mapping | Usage / pricing | Errors | Verdict |
|---|---|---|---|---|
| Moderations: OpenAI, Mistral, OVHcloud | `executors/openai/moderations`, `executors/ovhcloud/moderations` | No archived fixtures, so without database rows routes return `pricing_not_configured` (`pipeline/execute/index.ts:596-603`) | — | unknown |
| Rerank: Cohere | `executors/openai/rerank` | `requests` billed, `search_units` ignored (M5) | — | partial |
| Rerank: Baidu, Novita, Nebius, Scaleway, Voyage, Fireworks, Relace | as above | `input_text_tokens` | — | works / unknown |
| OCR: Mistral | `adapter-bridge.ts:357-376` → `mistral/endpoints/ocr.ts` | `input_pages`, annotation condition; prices in-adapter (H1) | — | partial |
| OCR: Upstage | standard mode only (`executors/upstage/ocr/index.ts:10-12`) | `input_pages` only if reported (L5) | — | unknown |
| Parse: Cohere | image URL only (`adapter-bridge.ts:378-388`) | `input_pages@0` fixture | — | works |
| Music: MiniMax | dedicated executor | `requests` + `output_audio_seconds` (`executors/minimax/music-generate/index.ts:290-310`) | no `stopFallback` for music, so a lost response fails over | partial |
| Music: Google Lyria | dedicated executor | `requests` only via token totals (L6) | — | partial |
| Music: ElevenLabs, GMI Cloud | adapter / dedicated | ElevenLabs prices in-adapter (H1) | — | partial |

## 4. What needs a live test (exact requests)

All of these use the user's existing session or BYOK, not new keys. Database readbacks are read-only.

1. **C1, TTS unbilled.** Run either check:
   - Database readback:
     ```sql
     select provider, count(*), sum(cost_nanos) from gateway_requests
     where endpoint = 'audio.speech' and created_at > now() - interval '30 days'
     group by 1;
     ```
     Expect no rows, or zero cost, for openai, azure, together, deepinfra, minimax, stepfun, novita and ovhcloud.
   - Live call:
     ```
     POST /v1/audio/speech
     {"model":"openai/gpt-4o-mini-tts","input":"Billing check.","voice":"alloy","provider":{"only":["openai"]}}
     ```
     Then `GET /v1/generations?id=<x-request-id>` should show no record. Repeat with `"stream_format":"sse"` and expect a 500.
2. **H3, transcription estimates.**
   ```
   POST /v1/audio/transcriptions   (multipart)
   model=openai/gpt-4o-mini-transcribe
   file=@voice_10s.webm   (Opus about 32 kbit/s, type audio/webm)
   debug={"return_upstream_response":true}
   ```
   Compare `usage.input_audio_tokens` in the gateway response with the upstream `usage.input_token_details.audio_tokens`. Repeat with `model=openai/whisper-1, response_format=json` and compare against `usage.seconds`.
3. **H2, grok-imagine-image $0.**
   ```
   POST /v1/images/generations
   {"model":"spacex-ai/grok-imagine-image","prompt":"a red cube","n":1}
   ```
   (no `resolution`). Check the cost. Repeat for `images/edits` with one image and no resolution, and expect a 502 plus two upstream dispatches in `provider_attempts` (H1).
4. **H2, minute-priced transcription.**
   ```
   POST /v1/audio/transcriptions
   model=openai/whisper-large-v3
   provider={"only":["together"]}
   file=@10s.mp3
   ```
   Check the cost. Database readback of price rows for `together:openai/whisper-large-v3` and `azure:microsoft/mai-transcribe-1*`.
5. **M4, Fireworks images.**
   ```
   POST /v1/images/generations
   {"model":"black-forest-labs/flux-1-schnell","prompt":"test","provider":{"only":["fireworks"]}}
   ```
   Expect a 404 from Fireworks in `failure_sample`.
6. **M5, Cohere rerank.**
   ```
   POST /v1/rerank
   {"model":"cohere/rerank-v3.5","query":"q","documents":[...250 short strings...]}
   ```
   with `debug.return_upstream_response`. Compare `meta.billed_units.search_units` (expect 3) with the billed `requests` (1).
7. **M3, anthropic-beta.** `POST /v1/messages` with header `anthropic-beta: <a current beta>` and `debug.return_upstream_request: true`. Confirm the header is absent upstream.
8. **M6, image streaming.**
   ```
   POST /v1/images/generations
   {"model":"spacex-ai/grok-imagine-image","prompt":"x","stream":true,"resolution":"1k"}
   ```
   Check the cost and the response shape.
9. **L5, L6, L9.**
   - One Upstage OCR call and one Lyria clip call; check that `usage.input_pages` / `usage.requests` are present and the cost is non-zero.
   - Database readback of `match` JSON shape for Upstage price rows.
10. **Vertex embeddings path.**
    ```
    POST /v1/embeddings
    {"model":"google/gemini-embedding-2","input":"hello","provider":{"only":["google-vertex"]}}
    ```
    Confirm `:embedContent` is accepted.

Sources consulted for provider behaviour: [Fireworks FLUX.1 schnell model page](https://fireworks.ai/models/fireworks/flux-1-schnell), [FLUX.1-schnell-fp8 model card (text_to_image workflow URL)](https://huggingface.co/fireworks-ai/FLUX.1-schnell-fp8-flumina).
