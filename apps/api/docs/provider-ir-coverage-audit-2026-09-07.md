# Provider IR coverage audit — 2026-09-08

Scope: gateway integrations and actual model hosts. External gateway onboarding is excluded. Existing catalog models were used; no new canonical models were introduced. An executor registration demonstrates a code path, not universal model or parameter support.

## Results

The inventory contains **1,495 active ordinary capability offers with zero missing executor registrations** across the 90 providers selected by the gateway-integration filter. An offer is a provider/model/capability combination, not a unique model. Batch and realtime use separate surfaces. Pricing, credentials, model availability and regional configuration remain independent requirements.

- Alibaba Cloud and ModelScope: native Qwen image generation/editing, ModelScope text routing, documented inputs and matching prices.
- DeepInfra: native image generation/editing with reported-cost billing; embeddings; Whisper and Qwen transcription; Kokoro and Qwen speech; four video models with durable submission records, authenticated per-job callbacks, retained reservations on uncertain submission, owned result retrieval and exact native-cost settlement. Missing native cost cannot fall back to charging the estimate.
- Google: AI Studio transcription through Interactions, Vertex transcription through the native Gemini endpoint, and multimodal Gemini Embedding 2 accounting. Vertex Claude uses the correct streaming RPC, current model IDs and region-specific prices; managed open models use the MaaS endpoints and preserve reasoning. EU routing rejects incompatible configured locations.
- Azure: native Foundry/OpenAI routing, including MAI endpoint selection. Ten existing text offers were matched to successful account deployments and price cards. Global Standard deployment placement is recorded without claiming EU execution. The account endpoint stays in runtime configuration.
- Baidu: Qwen embeddings, reranking and native Qwen image generation with sourced CNY-to-USD price conversion. Stepfun: native image generation/editing, speech and supported transcription variants with duration accounting and priced routes.
- Black Forest Labs: model-specific image contracts and reported-credit billing; FLUX.3 video submission, trusted polling, reservations, retrieval and pricing dimensions. Novita Seedance uses the documented native asynchronous endpoint. xAI video generation/editing registrations and prices cover the verified existing offers.
- Parasail: verified native model IDs and prices for 36 existing offers, plus embeddings. Friendli and other existing hosts retain their provider-specific contracts. GMI adds three authenticated, priced open-weight offers and preserves native reasoning text.
- OVHcloud: SDXL and locale-specific Riva speech. Upstage: native document operations and usage accounting. Relace: code reranking and source indices. Shared IR filtering preserves provider options, reasoning and supported output controls; Google multimodal accounting avoids double counting.
- Eight missing provider profiles were added for CoreWeave, Deepgram, HeyGen, Krea, Liquid, Perceptron, Recraft and Sourceful. Their model lists remain empty and routing disabled until existing-model offers, native contracts and prices can be verified.

## Explicitly deferred or blocked

| Provider / surface | Disposition and evidence |
| --- | --- |
| Runway image/audio; Stepfun step-asr-1.1 | Retained in the catalog and disabled by the user's decision. Durable media submission, result retrieval and billing recovery are deferred. No new general-purpose media-job API was added. |
| Google live translation | Remains disabled: realtime operation is not interchangeable with synchronous transcription. |
| Hyperbolic image | Remains disabled: former serverless documentation redirects to the current GPU platform documentation; the old image contract could not be reverified. |
| Morph embeddings/reranking | Remain disabled: legacy APIs and deprecation status require a verified current service contract. |
| NVIDIA embeddings/OCR | Remain disabled: hosted trial endpoints and evaluation availability do not establish production pricing or a deployable commercial route. |
| Crusoe VoiceChat | Corrected from generic audio generation to realtime speech. Disabled: speech-to-speech protocol support and sales-quoted pricing are required. Other Crusoe offers retain their existing disabled state; no Crusoe credential was available for authenticated validation. |
| Bedrock's remaining four offers | Mythos access is gated; the remaining model/region price and access combinations were not verified. No estimated price or substitute model was introduced. |
| GMI's remaining inactive offers | Closed-model resale routes remain outside the host-only scope. Qwen Max Preview and both MiMo 2.5 entries were absent under their stored IDs in the authenticated current list. No speculative remapping or activation. |
| Azure regional/undeployed offers | Only observed successful deployments were enabled. Additional deployment names, regions and account availability must be confirmed before activation. |
| Other inactive offers | Disabled states continue to reflect retirement, missing prices, unverified native operations or account/deployment requirements. Registration alone does not override them. |

DeepInfra video requires an HTTPS GATEWAY_PUBLIC_BASE_URL reachable by the provider. Completion depends on the native callback because DeepInfra documents no result-poll endpoint. A lost callback retains the reservation rather than guessing completion or cost. Authenticated video generation was not run. Long-running synchronous image adapters retain their existing request-lifetime limitations.

## Verification

- PR-branch deterministic run: 1,509 tests passed; one Alibaba Responses reasoning assertion failed across 246 executor, provider, video core, callback and selected retrieval suites. The same assertion independently fails on unmodified base commit 65ce7502a (39 other tests in that file pass). The failure is pre-existing, not introduced by this change.
- PR-branch pricing and shared text-filtering run: 149 tests passed across 22 files.
- API lint/typecheck passed with 39 lint warnings and no lint errors. Worker dry-run build passed.
- All three catalog gates passed: validate:data, validate:pricing and validate:gateway. Pricing covers 4,306 files; structure validation reports 153 non-blocking warnings. The catalog manifest is synchronized.
- Authenticated smoke: Azure gpt-4.1-nano and GMI Qwen3.6-35B-A3B, Hy3 and Hy3 Preview returned HTTP 200 with usage. GMI's authenticated model list supplied the three offers' prices, including Hy3 Preview context thresholds. These checks do not establish every model's tool, vision or streaming behavior.
- Earlier broad legacy matrix runs recorded 561 failures and 1,984 passes, including stale credentials, endpoint fixtures and unsupported-model expectations. They were not rerun as a claim that all legacy matrices are green. The focused and broader source suites cover the new behavior independently.
- Validation was repeated in an isolated branch based on current main. Unrelated working changes were preserved. No live deployment was run during PR preparation.

## Sources and reproduction

Price cards and model records carry their own provenance. Principal contracts include [DeepInfra webhooks](https://docs.deepinfra.com/account/webhooks), [DeepInfra native schemas](https://api.deepinfra.com/models/list), [Vertex model APIs](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/use-partner-models), [Vertex pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), [Azure retail prices](https://prices.azure.com/api/retail/prices), [Baidu pricing](https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya), [Crusoe inventory](https://docs.cloud.crusoe.ai/serverless-inference/index.html), [Runway task APIs](https://docs.dev.runwayml.com/api/), and [GMI pricing guidance](https://docs.gmicloud.ai/inference-engine/billing/price).

Run pnpm exec tsx scripts/audit-provider-executors.ts --gateway-only from apps/api; add --json for machine-readable details. Omit the filter to inspect all catalog providers, including disabled profiles without an executor.

## Gateway integration snapshot

Counts are current / active / executor. Batch and realtime are separate execution surfaces.

| Provider | Capability offers |
| --- | --- |
| ai21 |  |
| aion-labs | text.generate: 4 / 4 / yes |
| akashml | text.generate: 9 / 9 / yes |
| alibaba-cloud | text.generate: 97 / 82 / yes; image.generate: 3 / 3 / yes; image.edit: 4 / 4 / yes; embeddings: 2 / 2 / yes; video.generate: 5 / 2 / yes |
| amazon-bedrock | text.generate: 70 / 64 / yes |
| ambient | text.generate: 8 / 4 / yes |
| anthropic | text.generate: 14 / 11 / yes |
| anthropic-aws | text.generate: 12 / 2 / yes |
| anthropic-aws-us | text.generate: 8 / 1 / yes |
| anthropic-us | text.generate: 8 / 1 / yes |
| arcee-ai | text.generate: 12 / 8 / yes |
| atlascloud | text.generate: 60 / 60 / yes |
| avian | text.generate: 13 / 13 / yes |
| azure | text.generate: 67 / 10 / yes; image.generate: 8 / 0 / yes; image.edit: 2 / 0 / yes; audio.transcription: 2 / 0 / yes; audio.speech: 2 / 0 / yes |
| baidu | text.generate: 27 / 24 / yes; image.generate: 1 / 1 / yes; embeddings: 3 / 3 / yes; rerank: 3 / 3 / yes |
| baseten | text.generate: 15 / 13 / yes |
| black-forest-labs | image.generate: 9 / 9 / yes; image.edit: 7 / 7 / yes; video.generate: 1 / 1 / yes |
| byteplus | text.generate: 18 / 17 / yes; video.generate: 4 / 0 / yes; image.generate: 2 / 1 / yes; image.edit: 1 / 1 / yes |
| canopy-wave | text.generate: 11 / 10 / yes |
| cerebras | text.generate: 3 / 3 / yes |
| chutes | text.generate: 14 / 0 / yes |
| cloudflare | text.generate: 33 / 2 / yes; embeddings: 2 / 1 / yes; image.generate: 5 / 0 / yes; audio.transcription: 3 / 2 / yes |
| cohere | text.generate: 6 / 4 / yes; rerank: 3 / 3 / yes; embeddings: 3 / 3 / yes; audio.transcription: 2 / 0 / yes; parse: 1 / 1 / yes |
| crofai | text.generate: 24 / 23 / yes |
| crusoe | text.generate: 15 / 0 / yes; audio.realtime: 1 / 0 / separate |
| deepinfra | text.generate: 87 / 80 / yes; embeddings: 5 / 5 / yes; image.generate: 10 / 10 / yes; image.edit: 7 / 7 / yes; video.generate: 4 / 4 / yes; audio.speech: 3 / 3 / yes; audio.transcription: 4 / 4 / yes |
| deepseek | text.generate: 3 / 3 / yes |
| elevenlabs | music.generate: 1 / 1 / yes; audio.speech: 6 / 6 / yes; audio.transcription: 1 / 1 / yes |
| fal | video.generate: 2 / 0 / yes |
| fireworks | image.generate: 2 / 2 / yes; text.generate: 24 / 21 / yes; embeddings: 1 / 1 / yes; rerank: 1 / 1 / yes |
| friendli | text.generate: 8 / 7 / yes; audio.transcription: 1 / 1 / yes |
| gmicloud | text.generate: 81 / 42 / yes |
| google-ai-studio | text.generate: 26 / 19 / yes; image.generate: 3 / 3 / yes; audio.realtime: 3 / 1 / separate; audio.speech: 1 / 1 / yes; audio.translations: 1 / 0 / missing; embeddings: 2 / 2 / yes; video.generate: 4 / 3 / yes; music.generate: 4 / 2 / yes; audio.transcription: 1 / 1 / yes |
| google-vertex | text.generate: 40 / 37 / yes; audio.translations: 1 / 0 / missing; embeddings: 1 / 1 / yes; video.generate: 3 / 2 / yes; audio.transcription: 1 / 1 / yes; audio.realtime: 1 / 0 / separate |
| google-vertex-eu | text.generate: 4 / 4 / yes |
| groq | text.generate: 8 / 7 / yes; audio.transcription: 2 / 2 / yes; audio.translations: 2 / 2 / yes |
| hyperbolic | text.generate: 13 / 0 / yes; image.generate: 1 / 0 / missing |
| inception | text.generate: 2 / 2 / yes |
| infermatic | text.generate: 3 / 0 / yes |
| inflection | text.generate: 3 / 2 / yes |
| io-net | text.generate: 40 / 34 / yes |
| ionrouter | text.generate: 17 / 17 / yes |
| liquid |  |
| longcat | text.generate: 1 / 1 / yes |
| ltx | video.generate: 4 / 4 / yes |
| mancer | text.generate: 4 / 0 / yes |
| mara | text.generate: 5 / 0 / yes |
| meta | image.generate: 1 / 1 / yes; image.edit: 1 / 1 / yes; text.generate: 7 / 4 / yes; audio.transcription: 1 / 1 / yes |
| minimax | video.generate: 5 / 4 / yes; image.generate: 1 / 1 / yes; image.edit: 1 / 1 / yes; text.generate: 7 / 7 / yes; music.generate: 4 / 2 / yes; audio.speech: 4 / 4 / yes |
| minimax-lightning | text.generate: 3 / 3 / yes |
| mistral | text.generate: 19 / 18 / yes; embeddings: 2 / 2 / yes; moderations: 1 / 1 / yes; ocr: 4 / 3 / yes; audio.transcription: 3 / 1 / yes; audio.speech: 1 / 0 / yes |
| mistral-eu | text.generate: 1 / 1 / yes |
| modelscope | text.generate: 38 / 38 / yes; image.edit: 2 / 2 / yes; image.generate: 1 / 1 / yes |
| moonshotai | text.generate: 4 / 3 / yes |
| moonshotai-turbo |  |
| morph | text.generate: 19 / 15 / yes; embeddings: 1 / 0 / missing; rerank: 1 / 0 / missing |
| morpheus | text.generate: 1 / 1 / yes; embeddings: 1 / 1 / yes; audio.speech: 1 / 0 / yes |
| nebius-token-factory | text.generate: 19 / 19 / yes; embeddings: 1 / 1 / yes |
| novita | embeddings: 1 / 1 / yes; rerank: 1 / 1 / yes; text.generate: 97 / 93 / yes; video.generate: 1 / 1 / yes |
| nvidia | text.generate: 85 / 0 / yes; embeddings: 12 / 0 / missing; ocr: 2 / 0 / missing |
| openai | text.generate: 90 / 43 / yes; batch: 42 / 42 / separate; audio.transcription: 5 / 4 / yes; audio.speech: 1 / 1 / yes; audio: 1 / 0 / missing; image.generate: 4 / 4 / yes; image.edit: 4 / 4 / yes; audio.realtime: 12 / 5 / separate; moderations: 1 / 1 / yes; video.generate: 3 / 2 / yes; embeddings: 3 / 3 / yes; audio.translations: 1 / 1 / yes |
| openai-eu | text.generate: 75 / 9 / yes; batch: 7 / 5 / separate; audio.realtime: 9 / 0 / separate |
| ovhcloud | text.generate: 7 / 4 / yes; embeddings: 3 / 0 / yes; moderations: 2 / 0 / yes; audio.transcription: 2 / 0 / yes; image.generate: 1 / 1 / yes; audio.speech: 4 / 4 / yes |
| parasail | text.generate: 40 / 35 / yes; embeddings: 1 / 1 / yes |
| perplexity | embeddings: 2 / 2 / yes |
| phala | text.generate: 10 / 0 / yes; embeddings: 1 / 0 / yes |
| poolside | text.generate: 4 / 3 / yes |
| reka | text.generate: 5 / 5 / yes |
| relace | text.generate: 6 / 1 / yes; rerank: 1 / 1 / yes |
| runway | video.generate: 14 / 0 / yes; audio.realtime: 1 / 0 / separate; image.generate: 9 / 0 / missing; audio.speech: 7 / 0 / missing |
| sail-research | text.generate: 8 / 5 / yes |
| sakana | text.generate: 9 / 2 / yes |
| sambanova | text.generate: 7 / 7 / yes |
| scaleway | text.generate: 4 / 0 / yes; embeddings: 1 / 0 / yes; rerank: 1 / 0 / yes; audio.transcription: 1 / 0 / yes |
| siliconflow | text.generate: 78 / 63 / yes |
| spacex-ai | text.generate: 5 / 5 / yes; image.generate: 2 / 2 / yes; image.edit: 2 / 2 / yes; video.generate: 2 / 2 / yes; video.edit: 1 / 1 / yes; audio.speech: 1 / 1 / yes; audio.realtime: 1 / 1 / separate; audio.transcription: 1 / 1 / yes |
| stepfun | text.generate: 19 / 15 / yes; audio.speech: 3 / 3 / yes; audio.transcription: 5 / 4 / yes; image.generate: 3 / 3 / yes; image.edit: 2 / 2 / yes |
| streamlake | text.generate: 46 / 2 / yes |
| tencent-cloud | text.generate: 20 / 0 / yes |
| tensorix | text.generate: 20 / 20 / yes; embeddings: 1 / 1 / yes |
| thinking-machines | text.generate: 29 / 0 / yes |
| together | text.generate: 58 / 29 / yes; image.generate: 5 / 5 / yes; audio.transcription: 1 / 1 / yes; audio.translations: 1 / 1 / yes |
| upstage | text.generate: 5 / 4 / yes; embeddings: 4 / 2 / yes; ocr: 4 / 2 / yes |
| venice | text.generate: 100 / 100 / yes |
| venice-e2ee | text.generate: 11 / 0 / yes |
| voyage | embeddings: 26 / 25 / yes; rerank: 6 / 6 / yes |
| wafer | text.generate: 6 / 6 / yes |
| weights-and-biases | text.generate: 31 / 29 / yes |
| xiaomi | text.generate: 3 / 3 / yes; audio.speech: 3 / 3 / yes; audio.transcription: 1 / 1 / yes |
| z-ai | text.generate: 20 / 18 / yes |
