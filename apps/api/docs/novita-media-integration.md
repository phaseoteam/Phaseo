# Novita media integration

Reviewed on 2026-10-07. The existing Phaseo media API contracts and SDK surfaces
are sufficient for this initial integration. No public schema or SDK changes are
required. The canonical catalogue remains in Supabase, not repository fixtures.

## Supported coverage

- `kling/kling-v3.0-std` and `kling/kling-v3.0-pro`: `POST /v1/videos`.
  The adapter dispatches to Novita's reviewed `/v3/async/kling-v3.0-{std|pro}-{t2v|i2v}`
  endpoint according to the presence of a first image. One catalogue route per
  tier avoids competing text/image routes under the same canonical model.
  Supports 3–15 seconds, one video, optional generated audio, negative prompt,
  and `provider_params.cfg_scale` between 0 and 1. Text supports aspect ratios
  16:9, 9:16 and 1:1; image generation derives aspect ratio from the first frame
  and supports a last frame. `frame_images`, first/last `input_references`, and
  `input_reference` use the existing IR decoder. Multi-shot, generic references,
  resolution, seed, and other unreviewed controls are rejected.
- `fish-audio/s1`: `POST /v1/audio/speech` translates to `/v4beta/txt2speech`
  with the required `model: s1` header. Supports streamed binary mp3, wav, pcm
  and opus, optional `voice` as an existing Novita reference ID, and speed.
  Inline cloning, vendor configuration, instructions and SSE are rejected.
- `inclusionai/ming-image-0.1-design`: `POST /v1/images/generations` translates
  to `/openai/v1/images/generations`. Supports one text-to-image output, png/jpeg,
  URL/base64 response, `auto` size or dimensions of at least 1024 pixels per side.
  Edits, streaming and unreviewed image controls are rejected. JSON/base64
  responses are capped at 16 MiB. Native token details map to the existing
  `input_text_tokens` and `output_image_tokens` billing meters.

The executors resolve managed/BYOK credentials through the existing provider key
resolver. Video submission journals ownership before calling Novita, reserves
credits with audio-aware pricing options, and persists the native task ID. The
existing `/v3/async/task-result` reconciler retrieves output and drives wallet
settlement and Phaseo webhook notifications. Uncertain submissions and failures
to persist accepted jobs retain the credit hold and return a terminal gateway
error so automatic fallback cannot create duplicate paid jobs. Such cases still
require operational reconciliation; callers should retain the gateway request ID.

## Pricing and catalogue staging

Official [Novita pricing](https://novita.ai/pricing), checked 2026-10-07:

- Kling Standard: $0.084/second without audio; $0.126/second with audio.
- Kling Pro: $0.112/second without audio; $0.168/second with audio.
- Fish S1: $15 per million input characters.
- Ming Image: the page displays $0/M tokens with the former $1/M struck through.
  Promotion scope/expiry remains unconfirmed. Existing zero-price meters were
  preserved, and the SKU was moved to draft pending confirmation.

Phaseo Prod (`xansbgjaduxypzsmjwct`) now contains these four staged route IDs:
`novita:kling-v3.0-std`, `novita:kling-v3.0-pro`, `novita:fish-audio/s1`, and
the existing `novita:ming-image-0.1-design` with its corrected endpoint.
All have `routing_enabled=false`, `phaseo_status=implementing`, disabled
capabilities and disabled standard variants. Sources, supported controls and
deployment/live-validation gates are recorded in metadata. Readback of
`gateway_catalogue_source()` confirmed zero target routes in the routing export.
No other provider's routes or Novita Seedance pricing were changed.

## Activation

Merge and deploy the reviewed executors to all gateway regions first. Run
explicitly authorized paid canaries through Phaseo for managed and BYOK paths:
image output and token usage, speech bytes and character billing, both Kling
tiers with text/image input and audio on/off, polling, download, terminal failure,
wallet hold settlement, and webhook delivery/recovery. Confirm Ming's current
price before its canary and activation. Record evidence in the catalogue, then
enable each verified route, capability, variant and applicable SKU atomically.
Read back routing and prices through the normal gateway catalogue path.

No paid canaries or deployment were performed in this change. Retired Qwen
Image, Wan 2.5/2.6/2.7, Hailuo 2.3, MiniMax Music/Lyrics and MOSS TTS 1.5 were
excluded using the [September retirement notice](https://docs.novita.ai/changelog/01-09-26).
MiniMax H3, Speech 2.8, transcription, music, image layers and voice cloning need
separate contract and pricing verification before adding support.

## Official contracts

- [Kling Standard text](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-std-t2v)
  and [image](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-std-i2v).
- [Kling Pro text](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-pro-t2v)
  and [image](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-pro-i2v).
- [Fish Audio speech](https://docs.novita.ai/api-reference/model-apis-fish-audio-text-to-speech).
- [Ming Image](https://docs.novita.ai/api-reference/model-apis-ming-image-txt2img).
