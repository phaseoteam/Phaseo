# Coverage

## Executors (registered provider ids per capability in executors/index.ts)

| Capability | Registered | Exercised (executor layer) | Exercised (end-to-end) |
|---|---|---|---|
| audio.speech | 19 | – | 1/19 (5%) |
| audio.transcription | 21 | – | 1/21 (5%) |
| audio.translations | 5 | – | 1/5 (20%) |
| decisions.make | 14 | – | 0/14 (0%) |
| embeddings | 31 | – | 1/31 (3%) |
| image.edit | 16 | – | 1/16 (6%) |
| image.generate | 24 | – | 1/24 (4%) |
| moderations | 4 | – | 1/4 (25%) |
| music.generate | 4 | – | 0/4 (0%) |
| ocr | 2 | – | 1/2 (50%) |
| parse | 1 | – | 0/1 (0%) |
| rerank | 10 | – | 1/10 (10%) |
| text.generate | 113 | 108/113 (96%) | 6/113 (5%) |
| video.edit | 3 | – | 0/3 (0%) |
| video.generate | 22 | – | 1/22 (5%) |

Text executors with no upstream request in the executor layer: private-model, scaledown, liquid, liquid-ai, venice-e2ee (see results/MATRIX.md for each error).

## Catalogue routes and price cards

- Active text routes driven through their executor (up to three per provider, one per model family): 109/1281 (9%).
- Active routes (all capabilities) with a price card: 1550/1571 (99%); cards exercised by the pricing sweep: 1532/1550 (99%).
- Price meters exercised: 5347/5347 (100%); condition branches (tiers, resolutions, windows): 1466/1466 (100%).

| Capability | Cards | Exercised | Meters | Exercised |
|---|---|---|---|---|
| audio.generate | 0 | 0 | 0 | 0 |
| audio.realtime | 7 | 7 | 44 | 44 |
| audio.speech | 28 | 25 | 29 | 29 |
| audio.transcribe | 3 | 3 | 3 | 3 |
| audio.transcription | 22 | 22 | 26 | 26 |
| audio.translations | 4 | 4 | 4 | 4 |
| batch | 40 | 40 | 106 | 106 |
| embeddings | 11 | 11 | 11 | 11 |
| image.edit | 26 | 25 | 54 | 54 |
| image.generate | 36 | 35 | 60 | 60 |
| images.edits | 1 | 1 | 2 | 2 |
| images.generations | 4 | 4 | 33 | 33 |
| music.generate | 6 | 5 | 5 | 5 |
| ocr | 5 | 5 | 8 | 8 |
| parse | 1 | 1 | 1 | 1 |
| rerank | 7 | 7 | 8 | 8 |
| text.embed | 48 | 48 | 65 | 65 |
| text.generate | 1266 | 1256 | 4836 | 4836 |
| text.moderate | 2 | 2 | 2 | 2 |
| text.rerank | 1 | 1 | 1 | 1 |
| video.edit | 1 | 1 | 3 | 3 |
| video.generate | 31 | 29 | 46 | 46 |

## Documented request parameters (apps/docs/openapi/v1/openapi.yaml)

| Surface | Documented | Reached an upstream provider for at least one route | Never reached (all routes rejected or dropped) |
|---|---|---|---|
| chat | 36 | 32/36 (89%) | store, usage, meta, echo_upstream_request |
| responses | 28 | 27/28 (96%) | previous_response_id |
| messages | 16 | 13/16 (81%) | session_id, reasoning, provider_options |

Gateway-only parameters (`session_id`, `usage`, `meta`, `echo_upstream_request`, `debug`) are expected never to reach a provider.

## Executor-layer cases per route

Client scenarios: 225 (base 3, param 134, content 25, tools 17, cache 8, reasoning 8, stream 3, agent 27), plus BYOK on each surface, a tool-loop round trip per surface, and response variants (text, max usage, four finish reasons, refusal, mid-stream error) on each surface in both modes; HTTP error variants on chat.

## Not covered

- **Batches (/v1/batches) and files (/v1/files)**: Not built with makeEndpointHandler (the registry maps them to runNotImplementedPipeline); the batch routes own their own credential, reservation and job-store modules. Create-request mapping is already exercised with module mocks in src/routes/v1/data/batches.gateway-smoke.test.ts, so this harness does not duplicate it.
- **Realtime and live sessions (/v1/realtime, audio.realtime)**: Needs a WebSocket upgrade and the session Durable Object; there is no request/response pair for the finaliser to settle, so it cannot be driven through makeEndpointHandler offline.
- **Music generation**: music.generate persists job metadata (core/music-jobs) and its priced routes (ElevenLabs, Lyria) return provider-specific binary or long-running payloads that need their own writers; not attempted in this pass.
- **Video completion and download**: Only submission runs through the pipeline; completion is polled by routes/v1/data/videos.ts and settled by core/video-finalization outside makeEndpointHandler.
- **Parse (/v1/parse), decisions (/v1/decisions)**: Not in the requested family list for this pass; both run through the same non-text and decisions runners and can be added with a writer each.
- **Response cache hits, guardrail blocking, auto-router (phaseo/auto)**: getResponseCache() returns null in this build, guardrails need workspace guardrail rows, and the auto-router needs benchmark data; the harness uses an empty guardrail policy and never requests phaseo/auto.
- **route deepinfra:hexgrad/kokoro-82m:audio.generate**: active route with no price card
- **route fireworks:qwen/qwen3-reranker:rerank**: active route with no price card
- **route openai:openai/gpt-6-astra-pro:batch**: active route with no price card
- **route openai:openai/gpt-6-astra:batch**: active route with no price card
- **route openai:openai/gpt-image-1-mini:batch**: active route with no price card
- **route openai:openai/gpt-image-1:batch**: active route with no price card
- **route openai:openai/gpt-image-1:image.generate**: active route with no price card
- **route openai:openai/gpt-image-1.5:batch**: active route with no price card
- **route openai:openai/gpt-image-2:batch**: active route with no price card
- **route openai:openai/omni-moderation:batch**: active route with no price card
- **route openai:openai/sora-2-pro:batch**: active route with no price card
- **route openai:openai/sora-2:batch**: active route with no price card
- **route openai:openai/text-embedding-3-large:batch**: active route with no price card
- **route openai:openai/text-embedding-3-small:batch**: active route with no price card
- **route openai:openai/text-embedding-ada-002:batch**: active route with no price card
- **route voyage:voyage/rerank-1:rerank**: active route with no price card
- **route voyage:voyage/rerank-2-lite:rerank**: active route with no price card
- **route voyage:voyage/rerank-2:rerank**: active route with no price card
- **route voyage:voyage/rerank-2.5-lite:rerank**: active route with no price card
- **route voyage:voyage/rerank-2.5:rerank**: active route with no price card
- **route voyage:voyage/rerank-lite-1:rerank**: active route with no price card
- **card deepseek:deepseek/deepseek-v4.1-flash-preview:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card elevenlabs:eleven-labs/eleven-v4-turbo:audio.speech**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card elevenlabs:eleven-labs/eleven-v4:audio.speech**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card gmicloud:minimax/minimax-m2.7:free:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card gmicloud:minimax/minimax-m3:free:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card gmicloud:minimax/music-3.0:free:music.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card gmicloud:minimax/speech-2.8:free:audio.speech**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card gmicloud:tencent/hy-image-v3.5-preview:free:image.edit**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card gmicloud:tencent/hy-image-v3.5-preview:free:image.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card google-vertex:anthropic/claude-3-haiku:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card ltx:ltx-2-fast:video.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card ltx:ltx-2-pro:video.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card mistral:mistral/devstral-small-2:free:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card mistral:mistral/devstral-small-2:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card mistral:mistral/leanstral:free:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card mistral:mistral/magistral-small-1.2:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card mistral:mistral/mistral-small-3.2:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **card mistral:mistral/mistral-small-creative:text.generate**: no rule in effect at the sweep clock (all expired or not yet effective)
- **rule gmicloud:deepseek/deepseek-v4-pro:text.generate #3**: shadowed by #0 (same plan, meter and conditions; priority 100 vs 90, price 1.392 vs 1.74)
- **rule gmicloud:deepseek/deepseek-v4-pro:text.generate #4**: shadowed by #1 (same plan, meter and conditions; priority 100 vs 90, price 0.116 vs 0.145)
- **rule gmicloud:deepseek/deepseek-v4-pro:text.generate #5**: shadowed by #2 (same plan, meter and conditions; priority 100 vs 90, price 2.784 vs 3.48)
- **rule google-ai-studio:google/gemini-2.5-flash-image:text.generate #0**: shadowed by #3 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule google-ai-studio:google/gemini-2.5-flash-image:text.generate #1**: shadowed by #4 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #28**: shadowed by #60 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #29**: shadowed by #61 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #30**: shadowed by #62 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #31**: shadowed by #63 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #32**: shadowed by #64 (same plan, meter and conditions; priority 200 vs 100, price 3.75 vs 7.5)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #33**: shadowed by #65 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #34**: shadowed by #66 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #35**: shadowed by #67 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #36**: shadowed by #68 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #37**: shadowed by #69 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #38**: shadowed by #70 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #39**: shadowed by #71 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #40**: shadowed by #72 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #41**: shadowed by #73 (same plan, meter and conditions; priority 200 vs 100, price 1.875 vs 3.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #42**: shadowed by #74 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #43**: shadowed by #75 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #44**: shadowed by #76 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #45**: shadowed by #77 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #46**: shadowed by #78 (same plan, meter and conditions; priority 200 vs 100, price 1.875 vs 3.75)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #47**: shadowed by #79 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #48**: shadowed by #80 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #49**: shadowed by #81 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #50**: shadowed by #82 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #51**: shadowed by #83 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #52**: shadowed by #84 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #53**: shadowed by #85 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #54**: shadowed by #86 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #55**: shadowed by #87 (same plan, meter and conditions; priority 200 vs 100, price 6.75 vs 13.5)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #56**: shadowed by #88 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #57**: shadowed by #89 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #58**: shadowed by #90 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-ai-studio:google/gemini-3.6-flash:text.generate #59**: shadowed by #91 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #0**: shadowed by #32 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #1**: shadowed by #33 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #2**: shadowed by #34 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #3**: shadowed by #35 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #4**: shadowed by #36 (same plan, meter and conditions; priority 200 vs 100, price 3.75 vs 7.5)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #5**: shadowed by #37 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #6**: shadowed by #38 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #7**: shadowed by #39 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #8**: shadowed by #40 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #9**: shadowed by #41 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #10**: shadowed by #42 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #11**: shadowed by #43 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #12**: shadowed by #44 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #13**: shadowed by #45 (same plan, meter and conditions; priority 200 vs 100, price 1.875 vs 3.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #14**: shadowed by #46 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #15**: shadowed by #47 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #16**: shadowed by #48 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #17**: shadowed by #49 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #18**: shadowed by #50 (same plan, meter and conditions; priority 200 vs 100, price 1.875 vs 3.75)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #19**: shadowed by #51 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #20**: shadowed by #52 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #21**: shadowed by #53 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #22**: shadowed by #54 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #23**: shadowed by #55 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #24**: shadowed by #56 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #25**: shadowed by #57 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #26**: shadowed by #58 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #27**: shadowed by #59 (same plan, meter and conditions; priority 200 vs 100, price 6.75 vs 13.5)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #28**: shadowed by #60 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #29**: shadowed by #61 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #30**: shadowed by #62 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-ai-studio:google/gemini-3.7-flash:text.generate #31**: shadowed by #63 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #28**: shadowed by #60 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #29**: shadowed by #61 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #30**: shadowed by #62 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #31**: shadowed by #63 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #32**: shadowed by #64 (same plan, meter and conditions; priority 200 vs 100, price 3.75 vs 7.5)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #33**: shadowed by #65 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #34**: shadowed by #66 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #35**: shadowed by #67 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #36**: shadowed by #68 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #37**: shadowed by #69 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #38**: shadowed by #70 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #39**: shadowed by #71 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #40**: shadowed by #72 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #41**: shadowed by #73 (same plan, meter and conditions; priority 200 vs 100, price 1.875 vs 3.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #42**: shadowed by #74 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #43**: shadowed by #75 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #44**: shadowed by #76 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #45**: shadowed by #77 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #46**: shadowed by #78 (same plan, meter and conditions; priority 200 vs 100, price 1.875 vs 3.75)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #47**: shadowed by #79 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #48**: shadowed by #80 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #49**: shadowed by #81 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #50**: shadowed by #82 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #51**: shadowed by #83 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #52**: shadowed by #84 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #53**: shadowed by #85 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #54**: shadowed by #86 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #55**: shadowed by #87 (same plan, meter and conditions; priority 200 vs 100, price 6.75 vs 13.5)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #56**: shadowed by #88 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #57**: shadowed by #89 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #58**: shadowed by #90 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-vertex:google/gemini-3.6-flash:text.generate #59**: shadowed by #91 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #0**: shadowed by #32 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #1**: shadowed by #33 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #2**: shadowed by #34 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #3**: shadowed by #35 (same plan, meter and conditions; priority 200 vs 100, price 0.75 vs 1.5)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #4**: shadowed by #36 (same plan, meter and conditions; priority 200 vs 100, price 3.75 vs 7.5)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #5**: shadowed by #37 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #6**: shadowed by #38 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #7**: shadowed by #39 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #8**: shadowed by #40 (same plan, meter and conditions; priority 200 vs 100, price 0.075 vs 0.15)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #9**: shadowed by #41 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #10**: shadowed by #42 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #11**: shadowed by #43 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #12**: shadowed by #44 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #13**: shadowed by #45 (same plan, meter and conditions; priority 200 vs 100, price 1.875 vs 3.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #14**: shadowed by #46 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #15**: shadowed by #47 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #16**: shadowed by #48 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #17**: shadowed by #49 (same plan, meter and conditions; priority 200 vs 100, price 0.375 vs 0.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #18**: shadowed by #50 (same plan, meter and conditions; priority 200 vs 100, price 1.875 vs 3.75)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #19**: shadowed by #51 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #20**: shadowed by #52 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #21**: shadowed by #53 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #22**: shadowed by #54 (same plan, meter and conditions; priority 200 vs 100, price 0.0375 vs 0.075)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #23**: shadowed by #55 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #24**: shadowed by #56 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #25**: shadowed by #57 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #26**: shadowed by #58 (same plan, meter and conditions; priority 200 vs 100, price 1.35 vs 2.7)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #27**: shadowed by #59 (same plan, meter and conditions; priority 200 vs 100, price 6.75 vs 13.5)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #28**: shadowed by #60 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #29**: shadowed by #61 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #30**: shadowed by #62 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule google-vertex:google/gemini-3.7-flash:text.generate #31**: shadowed by #63 (same plan, meter and conditions; priority 200 vs 100, price 0.135 vs 0.27)
- **rule longcat:meituan/longcat-2.0:text.generate #3**: shadowed by #0 (same plan, meter and conditions; priority 100 vs 90, price 0.3 vs 0.75)
- **rule longcat:meituan/longcat-2.0:text.generate #4**: shadowed by #1 (same plan, meter and conditions; priority 100 vs 90, price 0.006 vs 0.015)
- **rule longcat:meituan/longcat-2.0:text.generate #5**: shadowed by #2 (same plan, meter and conditions; priority 100 vs 90, price 1.2 vs 2.95)
- **rule mistral:mistral/ministral-3-3b:text.generate #0**: shadowed by #3 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule mistral:mistral/ministral-3-3b:text.generate #2**: shadowed by #4 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule mistral:mistral/ministral-3-3b:text.generate #5**: shadowed by #7 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule mistral:mistral/ministral-3-3b:text.generate #6**: shadowed by #8 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule mistral:mistral/ministral-3-3b:text.generate #9**: shadowed by #11 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule mistral:mistral/ministral-3-3b:text.generate #10**: shadowed by #12 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule mistral:mistral/ocr-4:ocr #0**: shadowed by #1 (same plan, meter and conditions; priority 110 vs 100, price 2 vs 4)
- **rule mistral:mistral/ocr-4:ocr #2**: shadowed by #3 (same plan, meter and conditions; priority 110 vs 100, price 0.5 vs 2)
- **rule openai-eu:openai/gpt-5.6-sol:batch #0**: shadowed by #8 (same plan, meter and conditions; priority 200 vs 100, price 2.2 vs 2.75)
- **rule openai-eu:openai/gpt-5.6-sol:batch #1**: shadowed by #9 (same plan, meter and conditions; priority 200 vs 100, price 0.22 vs 0.275)
- **rule openai-eu:openai/gpt-5.6-sol:batch #2**: shadowed by #10 (same plan, meter and conditions; priority 200 vs 100, price 2.75 vs 3.4375)
- **rule openai-eu:openai/gpt-5.6-sol:batch #3**: shadowed by #11 (same plan, meter and conditions; priority 200 vs 100, price 11 vs 16.5)
- **rule openai-eu:openai/gpt-5.6-sol:batch #4**: shadowed by #12 (same plan, meter and conditions; priority 200 vs 100, price 4.4 vs 5.5)
- **rule openai-eu:openai/gpt-5.6-sol:batch #5**: shadowed by #13 (same plan, meter and conditions; priority 200 vs 100, price 0.44 vs 0.55)
- **rule openai-eu:openai/gpt-5.6-sol:batch #6**: shadowed by #14 (same plan, meter and conditions; priority 200 vs 100, price 5.5 vs 6.875)
- **rule openai-eu:openai/gpt-5.6-sol:batch #7**: shadowed by #15 (same plan, meter and conditions; priority 200 vs 100, price 16.5 vs 24.75)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #32**: shadowed by #0 (same plan, meter and conditions; priority 200 vs 100, price 4.4 vs 5.5)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #33**: shadowed by #1 (same plan, meter and conditions; priority 200 vs 100, price 0.44 vs 0.55)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #34**: shadowed by #2 (same plan, meter and conditions; priority 200 vs 100, price 5.5 vs 6.875)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #35**: shadowed by #3 (same plan, meter and conditions; priority 200 vs 100, price 22 vs 33)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #36**: shadowed by #4 (same plan, meter and conditions; priority 200 vs 100, price 8.8 vs 11)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #37**: shadowed by #5 (same plan, meter and conditions; priority 200 vs 100, price 0.88 vs 1.1)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #38**: shadowed by #6 (same plan, meter and conditions; priority 200 vs 100, price 11 vs 13.75)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #39**: shadowed by #7 (same plan, meter and conditions; priority 200 vs 100, price 33 vs 49.5)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #40**: shadowed by #57 (same plan, meter and conditions; priority 200 vs 100, price 2.2 vs 2.75)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #41**: shadowed by #58 (same plan, meter and conditions; priority 200 vs 100, price 0.22 vs 0.275)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #42**: shadowed by #59 (same plan, meter and conditions; priority 200 vs 100, price 2.75 vs 3.4375)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #43**: shadowed by #60 (same plan, meter and conditions; priority 200 vs 100, price 11 vs 16.5)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #44**: shadowed by #61 (same plan, meter and conditions; priority 200 vs 100, price 4.4 vs 5.5)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #45**: shadowed by #62 (same plan, meter and conditions; priority 200 vs 100, price 0.44 vs 0.55)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #46**: shadowed by #63 (same plan, meter and conditions; priority 200 vs 100, price 5.5 vs 6.875)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #47**: shadowed by #64 (same plan, meter and conditions; priority 200 vs 100, price 16.5 vs 24.75)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #48**: shadowed by #65 (same plan, meter and conditions; priority 200 vs 100, price 8.8 vs 11)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #49**: shadowed by #66 (same plan, meter and conditions; priority 200 vs 100, price 0.88 vs 1.1)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #50**: shadowed by #67 (same plan, meter and conditions; priority 200 vs 100, price 11 vs 13.75)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #51**: shadowed by #68 (same plan, meter and conditions; priority 200 vs 100, price 44 vs 66)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #52**: shadowed by #69 (same plan, meter and conditions; priority 200 vs 100, price 17.6 vs 22)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #53**: shadowed by #70 (same plan, meter and conditions; priority 200 vs 100, price 1.76 vs 2.2)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #54**: shadowed by #71 (same plan, meter and conditions; priority 200 vs 100, price 22 vs 27.5)
- **rule openai-eu:openai/gpt-5.6-sol:text.generate #55**: shadowed by #72 (same plan, meter and conditions; priority 200 vs 100, price 66 vs 99)
- **rule openai:openai/gpt-5.2:batch #3**: shadowed by #0 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule openai:openai/gpt-5.2:batch #4**: shadowed by #1 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule openai:openai/gpt-5.2:batch #5**: shadowed by #2 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule openai:openai/gpt-5.3-chat:text.generate #3**: shadowed by #0 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule openai:openai/gpt-5.3-chat:text.generate #4**: shadowed by #1 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule openai:openai/gpt-5.3-chat:text.generate #5**: shadowed by #2 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule openai:openai/gpt-5.6-sol-pro:batch #0**: shadowed by #8 (same plan, meter and conditions; priority 200 vs 100, price 2 vs 2.5)
- **rule openai:openai/gpt-5.6-sol-pro:batch #1**: shadowed by #9 (same plan, meter and conditions; priority 200 vs 100, price 0.2 vs 0.25)
- **rule openai:openai/gpt-5.6-sol-pro:batch #2**: shadowed by #10 (same plan, meter and conditions; priority 200 vs 100, price 2.5 vs 3.125)
- **rule openai:openai/gpt-5.6-sol-pro:batch #3**: shadowed by #11 (same plan, meter and conditions; priority 200 vs 100, price 10 vs 15)
- **rule openai:openai/gpt-5.6-sol-pro:batch #4**: shadowed by #12 (same plan, meter and conditions; priority 200 vs 100, price 4 vs 5)
- **rule openai:openai/gpt-5.6-sol-pro:batch #5**: shadowed by #13 (same plan, meter and conditions; priority 200 vs 100, price 0.4 vs 0.5)
- **rule openai:openai/gpt-5.6-sol-pro:batch #6**: shadowed by #14 (same plan, meter and conditions; priority 200 vs 100, price 5 vs 6.25)
- **rule openai:openai/gpt-5.6-sol-pro:batch #7**: shadowed by #15 (same plan, meter and conditions; priority 200 vs 100, price 15 vs 22.5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #32**: shadowed by #0 (same plan, meter and conditions; priority 200 vs 100, price 4 vs 5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #33**: shadowed by #1 (same plan, meter and conditions; priority 200 vs 100, price 0.4 vs 0.5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #34**: shadowed by #2 (same plan, meter and conditions; priority 200 vs 100, price 5 vs 6.25)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #35**: shadowed by #3 (same plan, meter and conditions; priority 200 vs 100, price 20 vs 30)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #36**: shadowed by #4 (same plan, meter and conditions; priority 200 vs 100, price 8 vs 10)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #37**: shadowed by #5 (same plan, meter and conditions; priority 200 vs 100, price 0.8 vs 1)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #38**: shadowed by #6 (same plan, meter and conditions; priority 200 vs 100, price 10 vs 12.5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #39**: shadowed by #7 (same plan, meter and conditions; priority 200 vs 100, price 30 vs 45)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #40**: shadowed by #56 (same plan, meter and conditions; priority 200 vs 100, price 2 vs 2.5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #41**: shadowed by #57 (same plan, meter and conditions; priority 200 vs 100, price 0.2 vs 0.25)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #42**: shadowed by #58 (same plan, meter and conditions; priority 200 vs 100, price 2.5 vs 3.125)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #43**: shadowed by #59 (same plan, meter and conditions; priority 200 vs 100, price 10 vs 15)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #44**: shadowed by #60 (same plan, meter and conditions; priority 200 vs 100, price 4 vs 5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #45**: shadowed by #61 (same plan, meter and conditions; priority 200 vs 100, price 0.4 vs 0.5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #46**: shadowed by #62 (same plan, meter and conditions; priority 200 vs 100, price 5 vs 6.25)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #47**: shadowed by #63 (same plan, meter and conditions; priority 200 vs 100, price 15 vs 22.5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #48**: shadowed by #64 (same plan, meter and conditions; priority 200 vs 100, price 8 vs 10)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #49**: shadowed by #65 (same plan, meter and conditions; priority 200 vs 100, price 0.8 vs 1)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #50**: shadowed by #66 (same plan, meter and conditions; priority 200 vs 100, price 10 vs 12.5)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #51**: shadowed by #67 (same plan, meter and conditions; priority 200 vs 100, price 40 vs 60)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #52**: shadowed by #68 (same plan, meter and conditions; priority 200 vs 100, price 16 vs 20)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #53**: shadowed by #69 (same plan, meter and conditions; priority 200 vs 100, price 1.6 vs 2)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #54**: shadowed by #70 (same plan, meter and conditions; priority 200 vs 100, price 20 vs 25)
- **rule openai:openai/gpt-5.6-sol-pro:text.generate #55**: shadowed by #71 (same plan, meter and conditions; priority 200 vs 100, price 60 vs 90)
- **rule openai:openai/gpt-5.6-sol:batch #0**: shadowed by #8 (same plan, meter and conditions; priority 200 vs 100, price 2 vs 2.5)
- **rule openai:openai/gpt-5.6-sol:batch #1**: shadowed by #9 (same plan, meter and conditions; priority 200 vs 100, price 0.2 vs 0.25)
- **rule openai:openai/gpt-5.6-sol:batch #2**: shadowed by #10 (same plan, meter and conditions; priority 200 vs 100, price 2.5 vs 3.125)
- **rule openai:openai/gpt-5.6-sol:batch #3**: shadowed by #11 (same plan, meter and conditions; priority 200 vs 100, price 10 vs 15)
- **rule openai:openai/gpt-5.6-sol:batch #4**: shadowed by #12 (same plan, meter and conditions; priority 200 vs 100, price 4 vs 5)
- **rule openai:openai/gpt-5.6-sol:batch #5**: shadowed by #13 (same plan, meter and conditions; priority 200 vs 100, price 0.4 vs 0.5)
- **rule openai:openai/gpt-5.6-sol:batch #6**: shadowed by #14 (same plan, meter and conditions; priority 200 vs 100, price 5 vs 6.25)
- **rule openai:openai/gpt-5.6-sol:batch #7**: shadowed by #15 (same plan, meter and conditions; priority 200 vs 100, price 15 vs 22.5)
- **rule openai:openai/gpt-5.6-sol:text.generate #32**: shadowed by #0 (same plan, meter and conditions; priority 200 vs 100, price 4 vs 5)
- **rule openai:openai/gpt-5.6-sol:text.generate #33**: shadowed by #1 (same plan, meter and conditions; priority 200 vs 100, price 0.4 vs 0.5)
- **rule openai:openai/gpt-5.6-sol:text.generate #34**: shadowed by #2 (same plan, meter and conditions; priority 200 vs 100, price 5 vs 6.25)
- **rule openai:openai/gpt-5.6-sol:text.generate #35**: shadowed by #3 (same plan, meter and conditions; priority 200 vs 100, price 20 vs 30)
- **rule openai:openai/gpt-5.6-sol:text.generate #36**: shadowed by #4 (same plan, meter and conditions; priority 200 vs 100, price 8 vs 10)
- **rule openai:openai/gpt-5.6-sol:text.generate #37**: shadowed by #5 (same plan, meter and conditions; priority 200 vs 100, price 0.8 vs 1)
- **rule openai:openai/gpt-5.6-sol:text.generate #38**: shadowed by #6 (same plan, meter and conditions; priority 200 vs 100, price 10 vs 12.5)
- **rule openai:openai/gpt-5.6-sol:text.generate #39**: shadowed by #7 (same plan, meter and conditions; priority 200 vs 100, price 30 vs 45)
- **rule openai:openai/gpt-5.6-sol:text.generate #40**: shadowed by #57 (same plan, meter and conditions; priority 200 vs 100, price 2 vs 2.5)
- **rule openai:openai/gpt-5.6-sol:text.generate #41**: shadowed by #58 (same plan, meter and conditions; priority 200 vs 100, price 0.2 vs 0.25)
- **rule openai:openai/gpt-5.6-sol:text.generate #42**: shadowed by #59 (same plan, meter and conditions; priority 200 vs 100, price 2.5 vs 3.125)
- **rule openai:openai/gpt-5.6-sol:text.generate #43**: shadowed by #60 (same plan, meter and conditions; priority 200 vs 100, price 10 vs 15)
- **rule openai:openai/gpt-5.6-sol:text.generate #44**: shadowed by #61 (same plan, meter and conditions; priority 200 vs 100, price 4 vs 5)
- **rule openai:openai/gpt-5.6-sol:text.generate #45**: shadowed by #62 (same plan, meter and conditions; priority 200 vs 100, price 0.4 vs 0.5)
- **rule openai:openai/gpt-5.6-sol:text.generate #46**: shadowed by #63 (same plan, meter and conditions; priority 200 vs 100, price 5 vs 6.25)
- **rule openai:openai/gpt-5.6-sol:text.generate #47**: shadowed by #64 (same plan, meter and conditions; priority 200 vs 100, price 15 vs 22.5)
- **rule openai:openai/gpt-5.6-sol:text.generate #48**: shadowed by #65 (same plan, meter and conditions; priority 200 vs 100, price 8 vs 10)
- **rule openai:openai/gpt-5.6-sol:text.generate #49**: shadowed by #66 (same plan, meter and conditions; priority 200 vs 100, price 0.8 vs 1)
- **rule openai:openai/gpt-5.6-sol:text.generate #50**: shadowed by #67 (same plan, meter and conditions; priority 200 vs 100, price 10 vs 12.5)
- **rule openai:openai/gpt-5.6-sol:text.generate #51**: shadowed by #68 (same plan, meter and conditions; priority 200 vs 100, price 40 vs 60)
- **rule openai:openai/gpt-5.6-sol:text.generate #52**: shadowed by #69 (same plan, meter and conditions; priority 200 vs 100, price 16 vs 20)
- **rule openai:openai/gpt-5.6-sol:text.generate #53**: shadowed by #70 (same plan, meter and conditions; priority 200 vs 100, price 1.6 vs 2)
- **rule openai:openai/gpt-5.6-sol:text.generate #54**: shadowed by #71 (same plan, meter and conditions; priority 200 vs 100, price 20 vs 25)
- **rule openai:openai/gpt-5.6-sol:text.generate #55**: shadowed by #72 (same plan, meter and conditions; priority 200 vs 100, price 60 vs 90)
- **rule weights-and-biases:nvidia/nemotron-3-super-120b-a12b:text.generate #0**: shadowed by #2 (same plan, meter and conditions; priority 100 vs 100, same price)
- **rule weights-and-biases:nvidia/nemotron-3-super-120b-a12b:text.generate #1**: shadowed by #3 (same plan, meter and conditions; priority 100 vs 100, same price)
- **adapter-side condition extraction for media cards**: condition values (image_params, video_params, resolution, mode, ...) are handed to the engine in usage.context; media adapters derive them from the request, which this layer does not run
- **executor usage mapping**: documented cases start from the gateway IR usage (core/ir.ts); the executor layer of the simulator covers native-to-IR mapping
- **BYOK fees, data-contribution discounts, tier markup, credits**: applied after calculatePricing
- **live catalogue rows**: the sweep reads the archived fixtures in packages/data/catalog/src/data; the database owns live rows
- **Executor layer: presets, guardrails, the auto-router, candidate ranking and sticky reads**: they need the database; the end-to-end layer covers what it can with module mocks
- **Executor layer: routes beyond three per provider**: routes of one provider share one executor and request mapping; every active route is still priced in the pricing sweep
