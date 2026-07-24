# Video API and provider billing research

Research date: 2026-07-11

## Executive conclusion

Phaseo does not need a second long-running-job subsystem for video. `main` already has the vertical video path: `POST /v1/videos`, list/get/cancel/content/download routes, provider executors, `gateway_async_operations`, polling reconciliation, wallet reservations, completion settlement, user webhooks, websocket lifecycle events, SDK helpers, docs, and usage UI. Production Wrangler configuration also enables the video API and its reconciler.

The correct build is to make video a first-class client of the generic async-operation work being hardened in the batch worktree. After that foundation lands, close the remaining contract and billing gaps. The highest-risk gap is not job creation; it is guaranteeing that the held amount and the terminal settlement use the provider's actual billable dimensions for every pricing family.

Recommended public contract: use OpenRouter's dedicated asynchronous video shape as the cross-provider surface, while retaining OpenAI-compatible field names and lifecycle semantics. Phaseo's current surface is already close to this contract.

## What exists on `main`

The current implementation already includes:

- `/v1/videos` and `/v1/video/generations` create/list/get/delete/cancel/content/download endpoints.
- A `/v1/videos/models` capability and pricing discovery endpoint.
- A generic `gateway_async_operations` record with `kind = video`.
- Up-front wallet holds and terminal capture/release.
- Scheduled polling reconciliation and provider-specific status normalization.
- Gateway-managed webhook delivery plus websocket lifecycle helpers.
- OpenAI, Google AI Studio, Google Vertex, Alibaba, MiniMax, BytePlus, Runway, AtlasCloud, xAI, fal, and generic OpenAI-compatible adapter code.
- Video price cards for OpenAI Sora, Google Veo, Alibaba Wan, MiniMax Hailuo, and BytePlus Seedance.

The batch worktree contains important unmerged improvements that are deliberately generic and should land before a wider video rollout:

- database-backed reconciliation leases and sharding;
- per-job `next_reconcile_at`, attempt counters, exponential backoff, and last-error state;
- atomic webhook delivery claims and redirect/SSRF hardening;
- atomic wallet settlement when actual cost differs from the initial hold;
- orphan-hold recovery.

Video-specific code in that worktree has already begun using the same lease and retry machinery. Rebuilding these pieces elsewhere would create two subtly different async systems.

## Provider billing families

| Family | Representative providers | Billable dimensions | Required Phaseo behavior |
| --- | --- | --- | --- |
| Output seconds | OpenAI Sora, Alibaba Wan | generated seconds, sometimes model/resolution | Quote from requested duration; settle from terminal duration and resolved output tier. |
| Seconds with feature tiers | Google Veo, fal-hosted Veo | seconds × resolution × audio flag | Persist normalized resolution and audio before submit; re-read provider output metadata at completion. |
| Fixed configuration bundle | MiniMax Hailuo | one video at a particular duration/resolution/model | Match an exact configuration rule; reject unsupported combinations before provider submission. |
| Token-derived video | BytePlus Seedance | video tokens derived from input/output media; rate can differ when video input is present | Hold from a conservative estimate; settle from provider-returned `usage.total_tokens` whenever available. |
| Credits | Runway | model-specific credits per generated second, with occasional minimums or per-frame products | Normalize credits to money using the provider's current credit price; model minimums explicitly. |
| Provider-reported final cost | OpenRouter and aggregators | normalized final `usage.cost` plus SKU metadata for estimates | Use model SKU metadata for the hold and authoritative terminal cost for provider-cost accounting. Apply Phaseo markup/service fee separately. |
| Input plus output media | Alibaba reference-to-video and some edit APIs | billable input-video seconds plus output seconds | Meter input and output independently; do not reuse a text-to-video price card for editing/reference workflows. |

This should be represented as meters and conditional rules, not provider-specific arithmetic inside route handlers. The existing pricing engine is a good base, but the usage record must be able to carry `output_video_seconds`, `input_video_seconds`, `input_video_count`, `output_video`, `total_tokens`, `credits`, `output_frames`, resolution, audio, model variant, and pricing plan.

## Current provider findings

### OpenAI

OpenAI's video API is asynchronous. Creation returns a video job; clients retrieve the job until it is terminal or subscribe to `video.completed` and `video.failed` webhooks. The public lifecycle is `queued`, `in_progress`, `completed`, or `failed`. Creation uses `model`, `prompt`, optional `seconds`, `size`, and an optional input reference. The current create reference lists 4, 8, or 12 seconds and model-specific dimensions.

Pricing is per output second and varies by model and resolution. The current pricing page also publishes a 50% Batch rate for Sora video. The standard video guide does not explain how that Batch rate is selected, so Phaseo should not expose a `service_tier=batch` video promise until an official invocation path has been verified with a real API request or a more explicit reference page.

Phaseo's OpenAI executor, status polling, per-second price cards, and resolution matching align well with the official standard path. The main remaining concerns are exact validation of model-duration-size combinations and preserving upstream terminal dimensions for settlement.

Sources: [OpenAI video guide](https://developers.openai.com/api/docs/guides/video-generation), [OpenAI create-video reference](https://developers.openai.com/api/reference/resources/videos/methods/create), [OpenAI API pricing](https://developers.openai.com/api/docs/pricing).

### OpenRouter

OpenRouter now exposes a dedicated `POST /api/v1/videos` asynchronous API, `GET /api/v1/videos/{id}`, `GET /api/v1/videos/{id}/content`, and `GET /api/v1/videos/models`. Create returns `202` with `id`, `polling_url`, and `status`. Terminal poll responses add `generation_id`, `unsigned_urls`, and `usage.cost`. The model-list response includes supported resolutions, aspect ratios, sizes, passthrough parameters, and `pricing_skus`.

Its normalized create surface includes `model`, `prompt`, `duration`, `resolution`, `aspect_ratio`, `size`, `frame_images`, `input_references`, `generate_audio`, `seed`, `callback_url`, and provider passthrough options. This is a better cross-provider basis than OpenAI alone because it explicitly models heterogeneous video capabilities.

Phaseo's current route is very close, but it differs in several material places:

- Phaseo uses a nested `webhook` object rather than accepting OpenRouter's `callback_url` alias.
- Phaseo has no `frame_images` alias.
- Phaseo's `input_references` schema currently accepts only `image_url`, although OpenRouter allows image, audio, and video references and currently uses richer references for Seedance.
- Phaseo should return `generation_id`, terminal usage, and output URLs consistently in both poll and webhook payloads.
- An OpenRouter upstream adapter would need dynamic SKU ingestion for reservation estimates and terminal `usage.cost` capture; a static per-model catalog alone will drift too quickly.

Sources: [OpenRouter video generation guide](https://openrouter.ai/docs/guides/overview/multimodal/video-generation), [OpenRouter create-video reference](https://openrouter.ai/docs/api/api-reference/video-generation/create-videos), [OpenRouter video model reference](https://openrouter.ai/docs/api/api-reference/video-generation/list-videos-models).

### Google Vertex AI / Veo

Google uses long-running operations. Pricing is output-second based and is conditional on model, resolution, and whether synchronized audio is generated. Current Veo 3.1 pricing demonstrates why `audio` and normalized resolution must be first-class pricing context: standard, Fast, and Lite have different rates, and 4K is a separate tier.

The Phaseo price cards currently mirror these dimensions. Reconciliation must preserve the operation name, terminal duration, resolution, and audio choice. The generic reconciler should poll the operation as the authority even when a provider notification exists.

Source: [Vertex AI generative pricing, Veo section](https://cloud.google.com/vertex-ai/generative-ai/pricing).

### BytePlus / Seedance

Seedance 2.0 pricing is token based rather than a simple per-second rate. BytePlus publishes different token prices depending on whether video is included in the input. Draft mode can alter token consumption while retaining the token unit price.

Phaseo already has token-aware video pricing and reads `usage.total_tokens` during reconciliation. That actual usage must always win over the local pixel/frame-rate estimate at settlement. The estimate is suitable for a hold only. Input-video presence, input-video seconds, frame rate, dimensions, draft/final mode, and terminal total tokens must be retained in job metadata.

Sources: [BytePlus Seedance resource-pack and token rules](https://docs.byteplus.com/api/docs/ModelArk/2191775), [BytePlus draft video behavior](https://docs.byteplus.com/api/docs/ModelArk/2298881).

### MiniMax / Hailuo

MiniMax package consumption is configuration based. A 768p 6-second generation, 768p 10-second generation, and 1080p 6-second generation consume different units, and Fast has a different unit schedule. Failed generations and security-review failures do not deduct units.

Phaseo's legacy `output_video = 1` fallback with duration/resolution matching models this correctly. Validation must fail closed when no exact price rule matches; silently charging zero or extrapolating per second would be wrong.

Source: [MiniMax video package pricing](https://platform.minimax.io/docs/guides/pricing-video).

### Alibaba Model Studio / Wan

Wan text-to-video is billed per generated second with resolution tiers. Reference-to-video and video-editing products can bill input-video seconds plus output-video seconds. Failed calls and provider processing faults are not billed. Output URLs can be short lived, so Phaseo should copy completed assets to controlled storage or provide a first-party content proxy before expiry.

The existing Wan text-to-video rules are appropriate for that endpoint, but they must not be reused for reference-to-video without adding the input meter. Provider deployment region can also change the price and should be part of the provider identity or price-card context.

Sources: [Alibaba Model Studio pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing), [Wan text-to-video API](https://www.alibabacloud.com/help/en/model-studio/text-to-video-api-reference), [Wan reference-to-video billing](https://www.alibabacloud.com/help/en/model-studio/video-to-video-guide).

### Runway

Runway sells API credits at $0.01 per credit. Video models consume model-specific credits per generated second; some products add minimum charges, and video upscaling can be billed per output frame. This cannot be represented safely by a single generic per-second rule for the provider.

Phaseo has a Runway executor and reconciler but no Runway video price cards in the current catalog. Managed-credit submission therefore cannot be considered rollout-ready. Add explicit model/operation price cards, minimum-charge support, and per-frame meters before enabling managed Runway traffic.

Source: [Runway API pricing](https://docs.dev.runwayml.com/guides/pricing/).

### fal and model aggregators

fal exposes per-model pricing programmatically. Video models may charge per generated second or a fixed amount per video; server errors and queue wait time are not billed. Some products fall back to compute-time pricing.

An aggregator adapter should not hard-code a universal fal video price. Sync the provider pricing endpoint into dated Phaseo price cards, store the exact upstream endpoint/variant, and use provider-returned billing data when available.

Source: [fal model API pricing](https://fal.ai/docs/documentation/model-apis/pricing).

## Recommended Phaseo API contract

Keep the dedicated async resource:

```text
POST   /v1/videos
GET    /v1/videos
GET    /v1/videos/models
GET    /v1/videos/{id}
POST   /v1/videos/{id}/cancel
DELETE /v1/videos/{id}
GET    /v1/videos/{id}/content
POST   /v1/videos/{id}/download_url
```

Use a request compatible with OpenRouter's portable subset, with Phaseo extensions:

```json
{
  "model": "google/veo-3.1-fast",
  "prompt": "A paper boat crossing a rain puddle",
  "duration": 8,
  "resolution": "1080p",
  "aspect_ratio": "16:9",
  "generate_audio": true,
  "frame_images": [
    { "frame_type": "first_frame", "image_url": "https://example.com/start.png" }
  ],
  "input_references": [],
  "provider": { "only": ["google-vertex"] },
  "callback_url": "https://example.com/hooks/video",
  "webhook": {
    "url": "https://example.com/hooks/video",
    "events": ["video.progress", "video.completed", "video.failed"]
  },
  "output": { "access": "both" }
}
```

Rules:

- Accept `callback_url` as a convenience alias for `webhook.url`; reject conflicting values.
- Accept `frame_images` and normalize them to first/last-frame references.
- Support typed image/audio/video references without pretending every provider supports them.
- Validate requested dimensions against `/videos/models` capability metadata before reserving money.
- Return the Phaseo job ID immediately and persist it before any background handoff.
- Keep provider-native IDs internal except for the diagnostic `native_video_id` field.
- Normalize lifecycle to `pending`, `running`, `completed`, `failed`, `cancelled`, or `expired`, while preserving native status separately.
- Treat webhooks as notifications. Polling remains the recovery and source-of-truth path.
- Keep content retrieval separate from status and copy short-lived provider assets into Phaseo-controlled storage where policy allows.

## Recommended billing and reconciliation model

Use a two-ledger model:

1. **Provider cost ledger**: what Phaseo owes the upstream provider, preferably taken from authoritative provider usage/cost.
2. **Customer charge ledger**: provider cost transformed by Phaseo pricing, BYOK rules, service fees, discounts, and credits.

The current public response labels provider and user costs separately but populates both from the same value. Do not expose those labels as meaningfully distinct until separate values are stored.

Lifecycle:

1. Resolve provider, model variant, operation, region, pricing plan, and capability constraints.
2. Produce a quote containing normalized meters, price-card version/source, estimate, maximum authorized amount, and expiry.
3. Atomically hold the customer amount before upstream submission.
4. Submit once with an idempotency key and persist both Phaseo and native IDs immediately.
5. Reconcile using leased jobs with provider-aware backoff.
6. On completion, collect authoritative usage: seconds, resolution, audio, input media, frames, tokens, credits, and reported upstream cost.
7. Reprice with the same effective price-card version unless the contract explicitly uses provider-reported pass-through pricing.
8. Atomically settle the hold up or down; if actual cost exceeds the allowed bound, move to a recoverable billing-exception state rather than silently losing money.
9. On failure/cancellation/expiry, release the hold unless the provider reports a billable partial result.
10. Emit the terminal webhook only after durable settlement state is recorded. Retry webhook delivery independently.

Store at minimum:

- `provider_cost_nanos`, `customer_cost_nanos`, and currency;
- quote and terminal priced-usage snapshots;
- provider-reported usage and raw cost reference;
- price-card ID/version/effective timestamp;
- reservation ID, held amount, final captured amount, and settlement reason;
- native status, normalized lifecycle, progress, and last reconciliation error;
- output asset metadata and provider URL expiry;
- webhook attempts separately from execution attempts.

## Concrete gaps and priorities

### P0: merge/harden the shared async substrate

- Land reconciliation leases, `next_reconcile_at`, backoff, sharding, and last-error state from the batch worktree.
- Land atomic reservation settlement and orphan-hold recovery.
- Land atomic webhook delivery claims and delivery-time URL validation.
- Ensure video uses all of these generic paths.

### P0: make managed-provider billing fail closed

- Inventory every enabled video executor against an active price card.
- Do not advertise or route managed traffic to an executor with no resolvable quote.
- Add Runway pricing support before managed Runway rollout.
- Resolve the xAI executor/provider-ID mismatch with the catalog's current `spacex-ai` video price cards.
- Distinguish provider cost from customer charge in storage and public billing output.

### P1: close OpenRouter contract gaps

- Add `callback_url` and `frame_images` aliases.
- Expand `input_references` to typed image/audio/video references.
- Return normalized `generation_id`, output URLs, and terminal usage consistently.
- Add request/response conformance tests against the published OpenRouter OpenAPI document.

### P1: preserve authoritative usage

- Prefer terminal `usage.total_tokens` for Seedance.
- Preserve output resolution/audio/duration from Veo and Sora.
- Add independent input-video meters for reference/edit APIs.
- Model minimum charges and per-frame operations rather than forcing all video into seconds.

### P2: add OpenRouter as an upstream provider

This is useful for breadth, but it should follow the accounting work:

- sync `/api/v1/videos/models` capability and `pricing_skus` data;
- quote and reserve from the synced SKU;
- submit to `/api/v1/videos` with an idempotency key where supported;
- poll or receive callback, then read terminal `usage.cost`;
- store OpenRouter's `generation_id` for cost audit;
- keep Phaseo user pricing separate from OpenRouter provider cost;
- disable when ZDR is required because OpenRouter documents video generation as incompatible with ZDR enforcement.

### P2: operational rollout

- Start with OpenAI Sora and Google Veo because their billing dimensions are already well represented.
- Add MiniMax after strict configuration validation.
- Add BytePlus after confirming terminal token usage in live responses.
- Add Alibaba text-to-video, then separately add reference/edit meters.
- Add Runway/fal/OpenRouter only after dynamic or explicit pricing coverage exists.
- Add synthetic create/poll/content tests that use provider test modes or the smallest billable job and assert settlement.

## Suggested first implementation slice

After the batch substrate is merged, the smallest production-worthy slice is:

1. Rebase the video path on the generic reconciliation lease and atomic settlement changes.
2. Add a provider-price-card coverage gate to `/videos/models` and routing so unpriced managed providers are excluded.
3. Add OpenRouter-compatible `callback_url` and `frame_images` normalization without removing Phaseo's richer `webhook` object.
4. Split provider cost and customer charge fields in async metadata and public billing summaries.
5. Run deterministic tests for OpenAI per-second/resolution, Veo audio tiers, MiniMax fixed bundles, and Seedance terminal-token repricing.

That slice improves correctness for the video code already present, minimizes conflict with the active batch worktree, and creates the accounting foundation needed for an OpenRouter upstream adapter.
