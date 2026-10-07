# Novita media integration

Reviewed on 2026-10-07. The existing Phaseo media API contracts and SDK surfaces
are sufficient for this initial integration. No public schema or SDK changes are
required. The canonical catalogue remains in Supabase, not repository fixtures.

## Supported coverage

- `kling/kling-v3.0-std`, `kling/kling-v3.0-pro` and `kling/kling-v3.0-4k`: `POST /v1/videos`.
  The adapter dispatches to Novita's reviewed `/v3/async/kling-v3.0-{std|pro|4k}-{t2v|i2v}`
  endpoint according to the presence of a first image. One catalogue route per
  tier avoids competing text/image routes under the same canonical model.
  Supports 3–15 seconds, one video, optional generated audio, negative prompt,
  and `provider_params.cfg_scale` between 0 and 1. Text supports aspect ratios
  16:9, 9:16 and 1:1; image generation derives aspect ratio from the first frame
  and supports a last frame. `frame_images`, first/last `input_references`, and
  `input_reference` use the existing IR decoder. Multi-shot, generic references,
  resolution, seed, and other unreviewed controls are rejected.
- `kling/kling-v2-5-turbo` and `kling/kling-v2-1-master`: `POST /v1/videos`
  translates to Novita's unified `POST /v3/video/create`. The adapter selects
  `kling2.5_turbo_pro_{t2v|i2v}` or `kling2.1_master_{t2v|i2v}`. Supports 5 or
  10 seconds, one output, negative prompt, and `provider_params.guidance_scale`
  from 0 to 1. Text supports 16:9, 9:16 and 1:1; image input uses a first frame.
  Audio, ending frames, resolution and seed are rejected. The reviewed discovery
  schema still lists retired models, so it is not used as a runtime allowlist.
  Kling 3.0 remains on its model-specific API because it is absent from that schema.
- `fish-audio/s1`: `POST /v1/audio/speech` translates to `/v4beta/txt2speech`
  with the required `model: s1` header. Supports streamed binary mp3, wav, pcm
  and opus, optional `voice` as an existing Novita reference ID, and speed.
  Inline cloning, vendor configuration, instructions and SSE are rejected.
- `minimax/speech-2.8-hd` and `minimax/speech-2.8-turbo`:
  `POST /v1/audio/speech` translates to `/v3/minimax-speech-2.8-{hd|turbo}`.
  Requires an existing voice ID and fewer than 10,000 input characters. Supports
  mp3, wav, flac and pcm, with speed 0.5–2. Novita completes synchronously;
  bounded JSON/hex output is converted to binary audio, rather than claiming
  native low-latency streaming. SSE, instructions and vendor controls are rejected.
  Bills `extra_info.usage_characters`; missing or invalid usage fails closed.
  Response JSON is capped at 16 MiB. Native errors are translated to HTTP errors;
  uncertain submissions and malformed successful responses prevent automatic replay.
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
- MiniMax Speech 2.8: HD $100 and Turbo $60 per million billable characters,
  confirmed against [Novita's official announcement](https://blogs.novita.ai/minimax-speech-2-8-series-on-novita/)
  and model-page pricing configuration.
- Kling 2.5 Turbo: [published](https://blogs.novita.ai/kling-v2-5-turbo-api-novita-ai/)
  $0.35/5-second clip or $0.70/10-second clip; normalized to $0.07/second.
- Kling 2.1 Master: official model-page pricing configuration exposes
  `KLING_V21_{T2V|I2V}_MASTER` at $1.17 and corresponding `10S` SKUs at $2.34;
  normalized to $0.234/second. Both older Kling routes accept only 5/10-second
  clips, with deterministic tests confirming the normalized totals. Reconfirm
  their current quoted rates before activation; both SKUs remain draft.
- Kling 3.0 4K: model-page configuration identifies audio/silent SKUs but exposes
  no numeric rates. No pricing meters were fabricated. Pricing confirmation
  and separate audio/silent offers are required before any canary or activation.
- Ming Image: the page displays $0/M tokens with the former $1/M struck through.
  Promotion scope/expiry remains unconfirmed. Existing zero-price meters were
  preserved, and the SKU was moved to draft pending confirmation.

Phaseo Prod (`xansbgjaduxypzsmjwct`) now contains these nine staged route IDs:
`novita:kling-v3.0-std`, `novita:kling-v3.0-pro`, `novita:fish-audio/s1`, and
the existing `novita:ming-image-0.1-design` with its corrected endpoint, plus
`novita:kling-v3.0-4k`, `novita:kling2.5_turbo_pro`, `novita:kling2.1_master`,
`novita:minimax-speech-2.8-hd` and `novita:minimax-speech-2.8-turbo`.
All have `routing_enabled=false`, `phaseo_status=implementing`, disabled
capabilities and disabled standard variants. Sources, supported controls and
deployment/live-validation gates are recorded in metadata. Readback of
`gateway_catalogue_source()` confirmed zero target routes in the routing export.
No other provider's routes or Novita Seedance pricing were changed.
The five expansion routes have draft pricing offers where rates were found;
4K has no offer until rates are confirmed. The existing canonical models were
reused; only `kling/kling-v3.0-4k` needed a new canonical model record.

## Activation

Merge and deploy the reviewed executors to all gateway regions first. Run
explicitly authorized paid canaries through Phaseo for managed and BYOK paths:
image output and token usage, all three speech models' bytes and character billing,
each Kling family with text/image input and applicable audio on/off, polling, download, terminal failure,
wallet hold settlement, and webhook delivery/recovery. Confirm Ming's current
price and 4K prices before their canaries and activation, and recheck older Kling
quotes. Record evidence in the catalogue, then
enable each verified route, capability, variant and applicable SKU atomically.
Read back routing and prices through the normal gateway catalogue path.

No paid canaries or deployment were performed in this change. Retired Qwen
Image, Wan 2.5/2.6/2.7, Hailuo 2.3, MiniMax Music/Lyrics and MOSS TTS 1.5 were
excluded using the [September retirement notice](https://docs.novita.ai/changelog/01-09-26).

## Further coverage

- Hunyuan Image 3 and Z-Image Turbo are additional image candidates. Novita's
  native image endpoints return asynchronous task IDs; the current image IR
  response has immediate image data and no public async image lifecycle.
  Supporting these properly requires persistent image job ownership, polling,
  output retrieval and billing settlement before enabling catalogue routes.
  A long request-local polling loop would not provide reliable job recovery.
- MiniMax H3 is named as a replacement in the retirement notice, but a verified
  Novita request schema and price were not available in the reviewed docs/config.
- Transcription, image layers, voice cloning/design and motion control need
  their own verified contracts. Voice management is distinct from speech synthesis.
  This PR implements reviewed coverage rather than enabling the entire provider catalogue.

## Official contracts

- [Kling Standard text](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-std-t2v)
  and [image](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-std-i2v).
- [Kling Pro text](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-pro-t2v)
  and [image](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-pro-i2v).
- [Kling 4K text](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-4k-t2v)
  and [image](https://docs.novita.ai/api-reference/model-apis-kling-v3.0-4k-i2v).
- [Unified video](https://docs.novita.ai/api-reference/reference-unified-video-generation)
  and its [live schema configuration](https://api.novita.ai/v3/admin/video-unify-api/config).
- [MiniMax Speech HD](https://docs.novita.ai/api-reference/model-apis-minimax-speech-2.8-hd)
  and [Turbo](https://docs.novita.ai/api-reference/model-apis-minimax-speech-2.8-turbo).
- [Hunyuan Image 3](https://novita.ai/docs/api-reference/model-apis-hunyuan-image-3).
- [Fish Audio speech](https://docs.novita.ai/api-reference/model-apis-fish-audio-text-to-speech).
- [Ming Image](https://docs.novita.ai/api-reference/model-apis-ming-image-txt2img).
