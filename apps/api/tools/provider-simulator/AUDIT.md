# Provider audit, 2026-10-17 (updated 2026-10-19)

This audit covers every registered text provider of the gateway. It used the provider simulator in this folder, plus code reading. Paths are relative to `apps/api/src` unless they say otherwise.

- **Base:** `origin/main` at `6551de1fa3` for the 17 October sections; `6dd0d405ce` for the 18 October run; `eba603bb65` for the 19 October run.
- **Live calls:** none were made to providers or to the Phaseo API.

Each finding is marked with how it was established:

- **simulated:** the simulator proved it, through the gateway's real code path with fetch captured. The scenario ids and provider counts come from `results/` and can be reproduced with `pnpm --filter @phaseo/gateway-api simulate:providers`.
- **traced:** established by reading the code.
- **needs-live:** only a live call can settle it, because it depends on what the provider actually accepts or returns.

The 19 October run after the second fix stack comes first, then the 18 October expected-outcome run. The 17 October audit they update follows from "Scope and limits" onwards; its finding numbers (N1–N20, B1–B4, R1–R8) are reused, and N21–N37 are new.

## After the second fix stack, 19 October

The 17 fix PRs proposed below (#2982–#3000) are merged. This run is the same simulator on the result.

- **Base:** `origin/main` at `eba603bb65`, after #2983, #2991, #3000, #2993, #2987, #2984, #2986, #2995, #2996, #2982, #2985, #2997, #2988, #2990, #2994, #2992 and #2999.
- **Live calls:** none.
- **Run:** `pnpm --filter @phaseo/gateway-api simulate:providers` exits 0 in about 8 min (pricing and end-to-end 59 s, executor layer 7 min 6 s).

### Gate result

9,033 mismatches (executor 8,734, end-to-end 10, pricing 289), all matched by the 25 entries in `expectations/allowlist.json`; none unused. 19 entries were removed because their fixes landed. One was added (`request-executor-file-url-rejected`, below).

### Before and after

| | 18 October (`6dd0d405ce`) | 19 October (`eba603bb65`) | Change |
|---|---|---|---|
| Mismatches, all layers | 24,484 | 9,033 | −15,451 (−63%) |
| Executor layer | 24,022 | 8,734 | −15,288 |
| End-to-end | 95 | 10 | −85 |
| Pricing sweep | 367 | 289 | −78 |
| Executor-layer groups | 855 | 696 | −159 |
| Simulated under-billing, all responses | $26.34 | $0.24 | −99% |
| Simulated over-billing, all responses | $1.32 | $0.0002 | |
| Allow-list entries | 43 | 25 | −18 |

Billing figures use the same method as on 18 October: the sum over every simulated response at the "max" usage of about 128k tokens per response, so they show relative size, not revenue.

**Retired entirely** (no mismatches left): N4 and N3 cache usage on every surface except one AkashML route, N6 truncated answers, N22 fast plan, N23 pricing engine and the Alibaba double read, N21 Claude web search, N2 and H3 speech and transcription billing, N25 reasoning field, N12 tool ids, N10 and N11 rejected SDK shapes and `/v1/messages` parameters, N28 `previous_response_id` (now a clear 400 that says the gateway does not store responses), N31 429 mapping, N32 model fallback after a 400, N33 presets, N37 zero output limit, and the end-to-end mid-stream and cache cases.

**Mostly fixed** (entry kept for the residual):

| Entry | 18 October | 19 October | What is left |
|---|---|---|---|
| `request-content-values` (N29) | 6,237 | 753 | Message `name` dropped (126); tool and tool-parameter descriptions dropped on some providers; a second system message's content changes type |
| `stream-grammar` (N26) | 2,010 | 4 | Vertex Gemini refusal streams (fixed by #3028) |
| `stream-citations-refusal` (N15) | 1,450 | 376 | Citations lost on `/v1/messages` (308); refusal text lost on every surface (64) |
| `stream-midstream-errors` (N7) | 1,397 | 20 | Vertex Gemini: a mid-stream error still ends as a successful finish |
| `stream-finish-mapping` (N5) | 1,324 | 16 | Vertex Gemini refusals: the Chat ones are fixed by #3028; on Responses a Gemini block ends `incomplete` with `content_filter`, where the expectation for a refusal says `completed` |
| `request-invented-defaults` (N9, N13) | 720 | 150 | Mostly `stream_options` sent unasked (102); `store`, `metadata` and `inference_geo` on a few providers |
| `reasoning-roundtrip` (N8) | 167 | 4 | Buffered `/v1/messages` on Bedrock loses the thinking signature and `redacted_thinking` |
| `billing-gemini-thinking` (N1) | 123 | 20 | AI Studio leaves 401 tool-use prompt tokens out of input; Vertex Messages bills image and audio prompt tokens as text; Vertex refusals (#3028) |
| `billing-messages-usage`, `billing-chat-cached-reads`, `billing-responses-claude-cache` | 434, 144, 29 | 2 each | AkashML `qwen/qwen3.5-35b-a3b`: the card has no cache-read row, and cached reads bill $0 instead of at the input rate |

`request-unsupported-forwarded` (4,353 → 3,505) and `request-params-dropped-or-changed` (2,108 → 2,041) moved less. #2999 drops and reports the parameters the capability check knows are unsupported; the rest are parameters the route data does not describe.

### Regression found and fixed

Since #2990, a Gemini stream that a safety filter blocks fails instead of ending with `content_filter`. Gemini sends `finishReason: SAFETY` or `PROHIBITED_CONTENT` with no content, which the empty-response guard from #1190 (`executors/google-ai-studio/text-generate/index.ts`) reports as `google_empty_response`; #2990 made that event fail the request. Streaming Chat clients got `finish_reason: "error"`, and buffered Chat requests to Vertex Gemini failed with `upstream_stream_failure` and were not billed ($0.22 of the $0.24 under-billing above). Responses and Messages clients already got `content_filter` and `refusal`. The existing entries matched these mismatches, so the gate did not fail; they showed up as new groups in `results/EXPECTATIONS.md`.

The follow-up, #3028, counts a `content_filter` finish as an answer and ends a prompt blocked through `promptFeedback.blockReason` the same way. With it applied, the Vertex-only run gives `content_filter` on Chat, `incomplete` with `content_filter` on Responses and `refusal` on Messages, all billed, and Vertex under-billing of $0; the gate still passes.

### New allow-list entry

`request-executor-file-url-rejected` (112 mismatches, 69 providers): Chat-dialect providers now return an explicit 400 `unsupported_parameter` for a Responses `input_file` sent by URL, because Chat Completions has no file-by-URL field (#2993). Before, the document was dropped and the model answered without it. The rejection is correct; it happens in the executor after routing rather than in the capability check, so it is filed under N30.

### Still needs a live test

The live checks from 18 October still apply, except N37 (fixed in code by #2984; a read-only readback of routes stored with `max_output_tokens = 0` is still worth doing) and N8 for Anthropic (streams and buffered responses now keep the signature; Bedrock buffered Messages does not). Add the `X-Phaseo-Dropped-Params` header from #2999: one request with an unsupported parameter pinned to a provider that lacks it.

## Expected-outcome run, 18 October

The simulator now checks declarative expected outcomes (`expectations/`) instead of only reporting differences, and fails when a mismatch is not on the justified allow-list (`expectations/allowlist.json`). This section reports that run against the code after the cache fix stack.

- **Base:** `origin/main` at `6dd0d405ce`, after #2964, #2965, #2969, #2970, #2957 and #2971 merged.
- **Live calls:** none. Only public specs and docs were fetched.
- **Layers:**
  - **executor:** 104 provider groups, 109 routes, 221 client scenarios per route, plus BYOK, a tool-loop round trip and a sticky-routing check per surface, and 11 response variants per surface and mode;
  - **end-to-end:** 111 cases through the real endpoint handler (auth, context, routing, failover, finaliser, charge and audit captured): text on three surfaces, presets, dynamic routes, BYOK, 429 and 5xx with `Retry-After`, mid-stream failure, embeddings, images, speech, transcription, translation, moderation, OCR, rerank and video submission;
  - **pricing:** every active price card (1,532 of 1,550 cards, 5,347 of 5,347 meters, 1,466 of 1,466 condition branches), priced by an independent BigInt calculator.
- **Coverage:** `results/COVERAGE.md`. Non-text families run one provider each, end to end. Batches, files, realtime and music are not driven (reasons in the coverage report).

### Gate result

`pnpm --filter @phaseo/gateway-api simulate:providers` exits 0 in 7 min 5 s. 24,484 mismatches (executor 24,022, end-to-end 95, pricing 367), all matched by the 43 justified entries in `expectations/allowlist.json`; none unused. Any new mismatch fails the run. The full table is `results/EXPECTATIONS.md`, with coverage in `results/COVERAGE.md`. The pricing figure is after two corrections to the sweep's own calculator (documented cache-write multipliers, Alibaba implicit hits), which removed 10 false positives.

### Before and after

The 17 October baseline is the same expectation engine run on `6551de1fa3`, before the stack (`results/baselines/2026-10-17.json`). The executor-layer case set has grown since then (affinity, BYOK, 3/10/40-step agents), so new groups are partly new coverage.

| | 17 October (`6551de1fa3`) | 18 October (`6dd0d405ce`) | Change |
|---|---|---|---|
| Executor-layer mismatches | 27,217 | 24,022 | −3,195 (−12%) |
| Executor-layer groups | 913 | 855 | −58 |
| Groups fixed | | 85 | |
| Groups new (includes new cases) | | 27 | |
| End-to-end mismatches | 120 | 95 | −25 |
| Pricing-sweep mismatches | 566 | 367 | −199 |
| Simulated under-billing, executor layer, all responses | not measured | $26.34 | |
| Gate: mismatches not on the allow-list | n/a | **0** of 24,484 | |

**Fixed by the stack** (largest groups):
- top-level `cache_control` is accepted on all three surfaces (was a 400 on all 104 providers; R5);
- `/v1/messages` streams report cache reads (88 providers) and writes, and Chat and Responses report `cache_write_tokens` (11 providers);
- `prompt_cache_key: null` is no longer sent to Responses upstreams (85 providers; G-F7);
- Claude cache writes are billed at the 5m and 1h rates on Chat, Responses and streamed Messages (5–6 providers per surface; B2);
- uncached input is no longer over-billed on Messages (54 providers, both modes), streamed Chat (15) and streamed Responses (3) (B2);
- Bedrock Claude goes to `/anthropic/v1/messages` on every surface (R1; captured URL `https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages`);
- Claude reasoning state is carried on streams (7–8 providers per surface), and the Responses tool-loop round trip keeps thinking signatures, `redacted_thinking` and encrypted reasoning;
- `user` reaches Claude as `metadata.user_id` (R6); developer and later system messages reach Claude;
- `prompt_cache_retention` reaches OpenAI (G-F8).

**New groups since the baseline** (27; most come from cases or checks added since 17 October):
- `previous_response_id` returns 400 on every provider (N28). #2965 forces `store: false` upstream, but `ResponsesRequest` in our OpenAPI spec still documents the parameter.
- Alibaba Qwen 3.8 Max bills one reported cache read on two meters (N23).
- Same-charge meter moves are now reported as renamed meters (N36): Vertex Claude writes, Kimi K3 writes, OpenRouter reasoning. This is a new check, not a new defect.
- OpenAI and OpenAI EU receive `include: ["reasoning.encrypted_content"]` without asking, on Responses and Messages. This is how #2970 round-trips reasoning with `store: false`, so it is intended; it is allow-listed under N13.
- Bedrock's upstream auth header is now `x-api-key`, because #2965 moved Claude to the Anthropic-compatible endpoint. The expectation still says `Authorization: Bearer`. Which header Bedrock Mantle's Anthropic endpoint accepts needs a live check (N18).
- Fireworks receives `reasoning_effort: 1337` when the client sends both an effort and a token budget. Its quirk maps the budget to an integer (`executors/_shared/text-generate/openai-compat/providers/fireworks/quirks.ts:92`), which the cached spec's enum does not allow. Needs a live check.
- The rest are new prompt-cache cases hitting the five executors that cannot run offline (harness), and single-provider parameter cases (Reflection `user`, `stream_options` on three providers).

**Found this round:** `max_output_tokens: 0` rejects every `/v1/messages` request on Parasail's Gemma routes (N37, code unchanged since 17 October). Buffered Chat and Messages responses from Claude still lose the thinking signature after #2970 (N8, below).

### Remaining mismatches, ranked by severity

Counts are mismatches and distinct providers on this run. Billing deltas are summed over every simulated response at the "max" usage of about 128k tokens per response, so they show relative size, not production revenue.

| Rank | Finding | Severity | Mismatches | Providers | Billing Δ (simulated) | What is wrong |
|---|---|---|---|---|---|---|
| 1 | N4 `billing-messages-usage` | Critical | 440 | 87 | −$12.51 | `/v1/messages` loses cache reads and writes for every provider; reads bill as input or not at all, writes are not billed |
| 2 | N3 `billing-chat-cached-reads` | Critical | 147 | 28 | −$9.34, +$0.92 | Chat clients of Claude and of Responses-dialect upstreams: reads billed as input, writes unbilled, no cached count returned |
| 3 | N6 `billing-truncated-unbilled` | Critical | 128 | 16 | −$2.19 | Length- and filter-truncated answers from Responses-dialect upstreams are unbilled for Chat clients |
| 4 | N22 `billing-fast-plan` | Critical | 15 | 2 | −$1.19 | Fast-tier requests bill at standard (or $0 where only a fast card exists) |
| 5 | N1 `billing-gemini-thinking` | Critical | 123 | 3 | −$0.18, +$0.26 | Gemini thinking and tool-use prompt tokens unbilled; image and audio prompt tokens billed as text |
| 6 | N2, H3 `billing-tts-unbilled`, `billing-stt-estimates` | Critical | 13 | 1 each (e2e) | −$0.05 | Speech is never priced, charged or audited; transcription is billed from file-size estimates |
| 7 | N21 `billing-anthropic-web-search` | High | 6 | 1 | −$0.12 | Claude web searches are never metered |
| 8 | N23 `billing-pricing-engine`, `billing-alibaba-double-read` | High | 75 | 9 | −$0.67, +$0.04 | `default` and `early_access` plans never selected, unreadable conditions, sub-nano truncation; Alibaba bills one cache read on two meters |
| 9 | B2 residual `billing-responses-claude-cache` | High | 29 | 11 | −$0.08, +$0.12 | `/v1/responses` with Claude: reads subtracted from an input that already excludes them; writes unbilled |
| 10 | N24, B1 `catalogue-data-rows`, `billing-pricing-throws` | High (data) | 292 | 36+ | – | Missing or wrong cache rows, expired-only rules, active routes without a card; 10 cards still throw |
| 11 | N7 `stream-midstream-errors` | High | 1,398 | 97 | – | A mid-stream upstream error is delivered as a successful completion; buffered clients get 200 and a success audit |
| 12 | N8 `reasoning-roundtrip` | High | 167 | 61 | – | **Residual of #2970:** buffered Chat and Messages responses from Claude (Anthropic, Bedrock, Anthropic on AWS) return thinking without its signature, so the next tool-loop step reaches Claude without a signed thinking block. Streams are fixed. Production's buffered path calls `encodeProtocol(protocol, ir, requestId)` with no reasoning origin after materialising the stream (`pipeline/surfaces/text-generate.ts:1299`, `protocols/shared/reasoning.ts:186-221`). Also: reasoning text missing from buffered Responses (46 providers), Vertex Gemini tool loops |
| 13 | N5 `stream-finish-mapping` | High | 1,324 | 98 | – | Buffered Messages always `end_turn`; content filter and refusal become `stop`; `stop_sequence` and `pause_turn` lost |
| 14 | N31, N32 `routing-429-as-502`, `routing-model-fallback` | High | 14 | 4 (e2e) | – | Upstream 429 reaches the client as 502; BYOK 429 drops the rate-limit headers; a 400 triggers a billed fallback to another model |
| 15 | N37 `routing-zero-max-output` | High | 14 | 1 | – | `max_output_tokens: 0` is treated as a limit, so every request with `max_tokens` (all of `/v1/messages`) is rejected; 3 active Parasail routes in the snapshot |
| 16 | N28 `request-previous-response-id` | High | 162 | 104 | – | Documented `previous_response_id` returns 400 since #2965 |
| 17 | N10, N11 `request-rejected-sdk-shapes`, `request-messages-params`, `request-other-rejections` | High | 1,355 | 104 | – | Assistant `content: null` and `file` parts rejected; documented `/v1/messages` params (`session_id`, `reasoning`, `provider_options`, `service_tier`) return 400 |
| 18 | N26 `stream-grammar` | Medium | 2,010 | 96 | – | A non-chunk `chat.completion` frame inside Chat streams; Claude-to-Responses deltas before `output_item.added` |
| 19 | N13, N9 `request-invented-defaults` | Medium | 720 | 99 | – | `temperature: 1`, `parallel_tool_calls`, `logprobs: false`, `safety_identifier`, `stream_options` and Claude adaptive thinking sent unasked; `input_items` to SambaNova, Ambient, Scaleway and Baidu |
| 20 | N14 `request-unsupported-forwarded`, `request-params-dropped-or-changed` | Medium | 6,461 | 92 | – | Parameters outside the provider's spec forwarded; parameters it defines dropped or sent with values outside its enum (see the policy question) |
| 21 | N29 `request-content-values` | Medium | 6,237 | 99 | – | Array tool results stringified into JSON text; message names dropped; Vertex Gemini replays no assistant `functionCall` |
| 22 | N15 `stream-citations-refusal` | Medium | 1,450 | 98 | – | Citations and refusal text lost on the way back |
| 23 | N18, N30, N33, N34 | Medium | 206 | 27 | −$0.004 | URL or dialect differs from the provider's docs; executor-local rejections after routing; preset system prompt dropped on Messages; Cohere rerank host and per-request billing; video submission fields |
| 24 | N25 `billing-usage-reasoning-field` | Low | 187 | 63 | – | Reasoning reported as top-level `reasoning_tokens`, not `completion_tokens_details.reasoning_tokens` |
| 25 | N12 `stream-tool-ids` | Low | 28 | 6 | – | Gemini `functionCall` ids replaced; Vertex Messages clients lose tool arguments |
| 26 | N36 `billing-meter-label` | Low | 12 | 3 | $0 net | Same charge on the wrong meter (Vertex Claude writes, Kimi K3 writes, OpenRouter reasoning) |
| – | N35, N19, harness | By design or docs | 1,481 | 8 | – | Google `cached_content` needs BYOK (docs gap); OpenAI `metadata.phaseo_request_id` differs per request; 5 executors cannot run offline |

### Proposed second fix round

These were merged as #2982–#3000 on 18–19 October; see "After the second fix stack" above for the result. Nothing in this branch changes gateway behaviour. Estimates are for one engineer with the simulator as the regression test, including tests.

Order: billing first, because it loses money on every request type; then streams; then request hygiene, which needs the policy decision below. Each PR removes its allow-list entries, so the gate proves the fix.

| # | PR | Findings (allow-list entries) | Evidence | Estimate |
|---|---|---|---|---|
| 1 | **billing-2a: cache and reasoning usage on every surface** | N3 `billing-chat-cached-reads`, N4 `billing-messages-usage`, B2 residual `billing-responses-claude-cache`, N25 `billing-usage-reasoning-field`, N36 `billing-meter-label` | Chat encoder writes reads as `usage.input_details.cached_tokens`, which `shapeUsageForClient` and the engine ignore (`protocols/openai-chat/encode.ts:196-211`, `pipeline/usage.ts:160-166`); `normalizeUsageToAnthropic` keeps only input and output (`executors/_shared/text-generate/openai-compat/index.ts:801-818`) | 2–3 days |
| 2 | **billing-2b: Gemini usage** | N1 `billing-gemini-thinking` | `thoughtsTokenCount` and `toolUsePromptTokenCount` are not added (`providers/google-ai-studio/usage.ts:116-142`); image and audio prompt tokens billed as text | 1 day |
| 3 | **billing-2c: truncated streams** | N6 `billing-truncated-unbilled` | A Responses-dialect upstream ending with `response.incomplete` produces no final chunk or usage for Chat and Messages clients (`stream-transforms.ts:384-399`); 16 providers. Ships with PR 6, since the fix is the same terminal-event mapping | with PR 6 |
| 4 | **billing-2d: non-text billing** | N2 `billing-tts-unbilled`, H3 `billing-stt-estimates` | TTS results are `kind: "stream"` while `ctx.stream` is false, so `finalizeRequest` skips pricing, charge and audit (`pipeline/after/index.ts:349-375`, `pipeline/surfaces/non-text.ts:575`); STT ignores `usage.seconds` (`audio-transcription-usage.ts:72-157`) | 2 days |
| 5 | **billing-2e: pricing engine** | N22 `billing-fast-plan`, N23 `billing-pricing-engine` and `billing-alibaba-double-read`, N21 `billing-anthropic-web-search` | `fast` cards selected as `priority` only in the fallback loader (`pipeline/before/context.sql:579`, `pricing/loader.ts:142`, `pipeline/after/pricing.ts:45,200`); `default` and `early_access` plans never selected; one Alibaba `cached_tokens` billed on two meters; `server_tool_use.web_search_requests` never metered (`anthropic-messages/encode.ts:169-172`, `stream-transformer.ts:303-313`) | 2–3 days |
| – | **catalogue data** (database operations, not a PR to this repo's code) | N24 `catalogue-data-rows`, B1 `billing-pricing-throws` | 199 cards without a cache-read row, 9 without a write row, 19 with read = input, 5 with read at $0, wrong Bedrock long-context 5m price, Novita overlapping tiers, 18 routes with only expired rules, 21 active routes without a card | 1–2 days with readback |
| 6 | **stream-2a: finish reasons and terminal events** | N5 `stream-finish-mapping`, N26 `stream-grammar`, plus PR 3 | Buffered Messages always `end_turn` (`stream-events.ts:672-678`); content filter and refusal become `stop`/`completed`; a final `object: "chat.completion"` frame inside Chat streams; Claude-to-Responses deltas before `output_item.added`; 96–98 providers | 2–3 days |
| 7 | **stream-2b: mid-stream errors and error mapping** | N7 `stream-midstream-errors`, `stream-midstream-e2e`; N31 `routing-429-as-502`; N32 `routing-model-fallback` | Buffered clients get 200 and a success audit after a mid-stream failure (`pipeline/surfaces/text-generate.ts:833-861`); upstream 429 becomes 502 (`pipeline/execute/guards.ts:631`, `pipeline/execute/http.ts:31`); BYOK 429 drops the rate-limit headers (`core/error-handler.ts:680`); a 400 triggers a billed model fallback (`pipeline/index.ts:25`) | 2 days |
| 8 | **stream-2c: reasoning and content returned to the client** | N8 `reasoning-roundtrip`, N15 `stream-citations-refusal`, N12 `stream-tool-ids` | Buffered Chat and Messages responses from Claude drop the thinking signature after materialisation (`pipeline/surfaces/text-generate.ts:1299` calls `encodeProtocol` with no reasoning origin; `protocols/shared/reasoning.ts:186-221`), so non-streaming Claude agents with thinking cannot continue a tool loop; reasoning text missing from buffered Responses (46 providers); citations and refusals lost (98 providers); Gemini `functionCall` ids replaced | 2–3 days; the Claude signature fix first, as a small separate PR |
| 9 | **request-2a: schema and documented parameters** | N10 `request-rejected-sdk-shapes`, N11 `request-messages-params` and `request-other-rejections`, N28 `request-previous-response-id`, N33 `routing-presets`, N35 docs | Zod rejects assistant `content: null` and `file` parts (`core/schemas.ts:549-557,818-823`); `/v1/messages` rejects `session_id`, `reasoning`, `provider_options`, `service_tier` (`pipeline/before/textParamPolicy.ts:287-317`); preset system prompt dropped on Messages (`presetMerge.ts:37`); zod `temperature` default overrides presets (`core/schemas.ts:869`) | 1–2 days |
| 10 | **request-2b: provider request hygiene** (split per provider family) | N9 and N13 `request-invented-defaults`, N14 `request-unsupported-forwarded` and `request-params-dropped-or-changed`, N29 `request-content-values`, N18 `request-url-and-dialect`, N30 `request-executor-*`, N34 `routing-nontext-misc` | SambaNova, Ambient, Scaleway and Baidu get `input_items`; `temperature: 1`, `parallel_tool_calls`, `logprobs: false` and `safety_identifier` sent unasked; array tool results stringified on 98 providers; Cohere rerank on the legacy host and billed per request | 3–5 days; blocked on the policy question |
| 11 | **new: zero output limit** | N37 `routing-zero-max-output` | `max_output_tokens = 0` treated as a limit (`pipeline/before/capabilityValidation.ts:365-371`); 3 active Parasail routes in the snapshot | 0.5 day plus a readback |

### Policy question

`apps/api/AGENTS.md` says unsupported parameters should be rejected explicitly, not dropped or forwarded. Our public docs only say support varies. Today the gateway forwards parameters the provider's API does not define (N14: 4,353 mismatches on 92 providers), drops some it does define, and rejects a few in the executor after routing (N30). The expectations accept rejection or removal and flag only forwarding. A decision is needed before request-2: reject before routing (strict, clear errors, but breaks clients that send OpenAI defaults everywhere), or drop silently with a `phaseo.dropped_params` notice (lenient).

**Decided 18 October:** drop and report. #2999 removes parameters the route does not support and lists them in the `X-Phaseo-Dropped-Params` response header.

### Still needs a live test

Section 4 still applies. Add:
- **N37:** read back production routes with `max_output_tokens = 0` (read-only query) before fixing the code or the data.
- **N28:** decide whether `previous_response_id` should be removed from the docs or supported through a stored-response path; no live call needed.
- **Bedrock auth (N18):** one `/v1/messages` request pinned to `amazon-bedrock` with a Claude model; a 401 means Mantle's Anthropic endpoint wants `Authorization: Bearer`.
- **Fireworks integer effort:** `reasoning: {effort: "high", max_tokens: 2048}` pinned to `fireworks`; check that an integer `reasoning_effort` is accepted.
- **N8 buffered signatures:** a non-streaming Claude tool loop with thinking on `/v1/chat/completions`; expect a 400 from Anthropic on step 2 if the signature is missing.
- **N36, N23 (Alibaba):** a provider-pinned request with cache hits on `qwen/qwen3.8-max-0902`, then compare the billed meters with `prompt_tokens_details.cached_tokens`.

## Scope and limits

**Providers.**
- 104 registered `text.generate` executor groups. Aliases of the same catalogue provider are merged.
- 68 have active catalogue routes. 36 have none and appear as "not routable".
- Up to three routes per provider are driven through the executor, one per model family. Every active route (1,279) is priced in the pricing sweep.

**Client scenarios.**
- 203 scenarios per route.
- Every documented top-level parameter of `ChatCompletionsRequest`, `ResponsesRequest` and `AnthropicMessagesRequest` in `apps/docs/openapi/v1/openapi.yaml`, plus curated variants.
- Every content part type, tool shape and `tool_choice`, reasoning and cache options.
- Three-step agent conversations on each surface.

**Response variants**, for each of chat, responses and messages, streaming and buffered:
- text;
- "max": reasoning and signatures, two parallel tool calls, citations, logprobs, and every documented usage field;
- four finish reasons and a refusal;
- HTTP errors and a mid-stream error.

**Specs.**
- 34 provider specs fetched (OpenAPI or Google discovery).
- 29 hand-written top-level schemas from API references.
- The OpenAI schema is used as a labelled baseline for the rest.
- `specs/manifest.json` records which is which.

**Catalogue.** This audit used the catalogue's archived JSON rows, which have since been removed. The simulator now reads routes and prices from the database (`src/catalogue.ts`), so a price or route changed since the audit can read differently in a new run.

**Not covered by the simulator.** These were traced instead (section 5, and `AUDIT-traced-nontext.md`):
- presets, guardrails, the auto-router, candidate ranking, sticky reads, BYOK, rate limits;
- the non-text endpoint families.

### What production does that the review missed

`pipeline/surfaces/text-generate.ts:686-691` forces `stream: true` upstream for every text request.

Buffered clients are rebuilt from the client-protocol stream (`materializeStreamResultToCompleted`, `:558-612`), which drops the executor's `usageFinalizer`. So the executors' non-streaming branches (for example `openai-compat/index.ts:330-354`) do not run for `/v1/chat/completions`, `/v1/responses` or `/v1/messages`.

Several cache-review findings were argued from those branches (see section 3). The simulator reproduces the real shape: streaming upstream, then either the stream rewriter (`pipeline/after/stream.ts:247-349`) or the materialiser.

## 1. Summary

**New critical and high findings** (not in the cache review):

1. **Gemini thinking tokens are never billed** (AI Studio and Vertex, every surface and mode). Neither are tool-use prompt tokens. (N1)
2. **Text-to-speech is never billed** on nine providers. (N2, traced)
3. **Cache reads are billed wrongly for Chat clients of Claude and of every provider routed to `/responses`.** Streaming bills reads at the full input price; buffered bills them twice. The client sees no cached count. (N3)
4. **`/v1/messages` loses cache reads and writes for every provider.** Non-Anthropic providers bill reads as full-price input. Claude bills reads and writes at zero. Input is reported in OpenAI semantics. (N4)
5. **Buffered `/v1/messages` always returns `stop_reason: "end_turn"`**, on every provider including Claude. `max_tokens`, `stop_sequence`, `refusal` and `pause_turn` are lost. (N5)
6. **A Responses-API upstream that stops early (`response.incomplete`) breaks Chat clients.** The stream has no `finish_reason`, no final chunk and no usage, so length-truncated responses are unbilled. (N6)
7. **Mid-stream upstream errors are delivered as successful completions** on most surface and dialect pairs. (N7)
8. **Claude thinking signatures and `redacted_thinking` are lost on `/v1/messages` too**, not only on Chat and Responses. (N8)
9. **SambaNova (all 7 active routes) and Ambient's Kimi route get `input_items` instead of `input` on `/v1/responses`.** (N9)
10. **Our own request schema rejects shapes OpenAI SDKs send**: `content: null` on assistant tool-call messages, and `file` parts. It also strips per-part cache markers. (N10)
11. **Three documented `/v1/messages` parameters return 400 `unknown_param`**: `session_id`, `reasoning` and `provider_options`. (N11)

**On the cache review:**
- B1, B2, R1, R2, R5, R6, G-F7 and G-F8 are confirmed by simulation. B2 is extended to buffered clients and to the Messages surface.
- R8 is disproved: `cherryPickIRParams` never filters in production.
- R4 is disproved on Chat (the breakpoint never reaches any provider).
- The "1× + 1.25×" half of B3 cannot happen on the text surfaces.

Details are in section 3.

**Verdicts:**

| Verdict | Providers |
|---|---|
| works | 0 |
| partial | 16 |
| broken | 52 |
| not routable | 36 |

No routable provider passes cleanly. The shared response path (N3–N7) affects all of them. The verdict rules are in `src/report.ts`.

## 2. Findings ranked by severity

### Critical

**N1. Gemini thinking output and tool-use prompt tokens are never billed.**
- **Mark:** simulated. Google's current split is needs-live.
- **Evidence:**
  - `providers/google-ai-studio/usage.ts:125-133`: `outputTokens` = `candidatesTokenCount`.
  - `:139-142`: `thoughtsTokenCount` only becomes `reasoningTokens`; it is never added to output.
  - `:116-117`: input = `promptTokenCount`, so `toolUsePromptTokenCount` is ignored. `normalizeGoogleUsage` does add it (`:78`), but its result is not used for the input total.
  - The engine then bills `output_text_tokens` = canonical output (`pipeline/pricing/engine.ts:395-410`).
- **Simulated:**
  - For `google-vertex` and `google-vertex-eu` (generateContent) and `google-ai-studio` (Interactions), on all three surfaces in both modes:
    - metered output = 3,894 for a response with `candidatesTokenCount` 3,894 and `thoughtsTokenCount` 1,109;
    - input is short by the 401 tool-use prompt tokens.
  - Google documents `totalTokenCount = prompt + candidates + toolUsePrompt + thoughts` and bills thinking at the output rate.
- **Impact:** Gemini 3.x thinking is often most of the output, so every thinking request on Phaseo's managed keys is under-billed by its thinking tokens.
- **Fix:** output = `candidatesTokenCount + thoughtsTokenCount`; input += `toolUsePromptTokenCount`. Add a regression test with the sentinel usage. **Effort:** S.
- **Live check:** a Gemini 3 thinking request whose `usageMetadata` has `thoughtsTokenCount`, compared with the billed `output_text_tokens`.

**N2. Text-to-speech is never priced, charged or logged.**
- **Mark:** traced. Found by the non-text sub-audit; I re-read the chain myself.
- **Evidence:**
  - Speech adapters return `kind: "stream"` (`providers/openai/endpoints/audio-speech.ts:412-418`; also DeepInfra, MiniMax, StepFun, Novita and OVHcloud, listed in `AUDIT-traced-nontext.md` C1).
  - `ctx.stream` is `Boolean(body.stream)`, and the speech schema has no `stream` field.
  - `normalized` is only set for `kind: "completed"` (`pipeline/surfaces/non-text.ts:575-580`).
  - So `finalizeRequest` skips both pricing branches (`pipeline/after/index.ts:349,368`). It ends in `handlePassthroughFallback` (`:373-375`), with no pricing, charge, success audit or quota settlement.
- **Affected:** OpenAI, OpenAI EU, Azure, Together, Morpheus, DeepInfra, MiniMax, StepFun, Novita, OVHcloud.
- **Fix:** materialise speech streams, or price from `bill.usage` in the passthrough branch. **Effort:** S–M.

### High

**N3. Chat clients of Claude, and of every provider routed to `/responses`, get cache reads billed wrongly.**
- **Mark:** simulated, root cause traced.
- **Evidence:**
  - The gateway's own Chat encoder writes the read as `usage.input_details.cached_tokens` and the write as `output_tokens_details.cached_tokens` (`protocols/openai-chat/encode.ts:196-211`).
  - The streaming biller shapes usage with `shapeUsageForClient`, which reads `input_tokens_details` and `prompt_tokens_details` only (`pipeline/usage.ts:160-166`). So the read is stripped and billed as input.
  - The buffered biller keeps the raw object. The engine finds `input_details.cached_tokens` (`engine.ts:225`) but treats reads as a subset of input only when `input_tokens_details.cached_tokens` is present (`engine.ts:388-394`). So the read is billed twice.
  - The Chat client's final usage carries no `prompt_tokens_details.cached_tokens`.
- **Simulated (chat surface, "max" usage):**
  - 13 Responses-upstream providers (Ambient, BytePlus, DeepSeek V4, Fireworks, Groq, Meta, Venice, …) and 4 Claude providers.
  - Stream: `cachedRead` −20,011, `uncachedInput` +20,011.
  - Buffered: `uncachedInput` +20,011, with the read also billed.
- **Side effects:**
  - No sticky pin forms on streams (`extractCacheAffinityTokens` sees no read).
  - This also explains part of B2's under-billing for Claude.
- **Fix:** have `shapeUsageForClient` and the engine read `input_details`, or emit `input_tokens_details` from `encodeUsage`. Add a cross-surface usage test. **Effort:** S.

**N4. `/v1/messages` drops cache usage for every provider.**
- **Mark:** simulated, root cause traced.
- **Evidence:**
  - For non-Anthropic providers, the Responses-to-Messages adapter's `normalizeUsageToAnthropic` keeps only `input_tokens` and `output_tokens` (`executors/_shared/text-generate/openai-compat/index.ts:801-818`).
  - The client gets `cache_read_input_tokens: null`, and `input_tokens` includes the cached tokens, which is wrong under Anthropic semantics.
- **Simulated:**
  - **Non-Anthropic providers:** on 47 chat-dialect and 13 Responses-dialect providers, reads are billed at the full input price on messages/stream and messages/buffered. Alibaba, Moonshot, OpenAI and Venice also lose writes.
  - **Claude itself (Anthropic, Vertex, Bedrock Messages):** the read (−20,011) and the write (−3,019) are billed at zero on both modes.
  - **Gemini:** reads are billed as input on this surface too.
- **Fix:**
  - Carry cache read and write (5m/1h split) and reasoning through `normalizeUsageToAnthropic`, using Anthropic semantics (input excludes cache).
  - Fix the Claude Messages re-encode to keep `cache_creation*` and `cache_read_input_tokens`.
- **Effort:** M.

**N5. Buffered `/v1/messages` always reports `stop_reason: "end_turn"`.**
- **Mark:** simulated, root cause traced.
- **Evidence:**
  - `pipeline/after/stream-events.ts:672-678` turns every `message_stop` into a stop event with a hard-coded `"end_turn"`.
  - The materialiser keeps the last stop it sees (`pipeline/surfaces/server-tools.stream.ts:629-634`), so the real `message_delta.stop_reason` is overwritten.
- **Simulated:** on all 68 routable providers, including native Claude:
  - `max_tokens`, `stop_sequence`, `refusal` and `pause_turn` arrive as `end_turn` on messages/buffered.
  - On messages/stream, a non-Anthropic provider's `content_filter`, `stop_sequence` and `pause_turn` also become `end_turn` (`openai-compat/index.ts:835-849`).
- **Impact:** agents use `max_tokens` to decide to continue. With this, truncated output looks complete.
- **Fix:** give `message_stop` no stop reason, or never overwrite a non-null reason. **Effort:** S.

**N6. Responses-API upstreams that end with `response.incomplete` break Chat clients.**
- **Mark:** simulated, root cause traced.
- **Evidence:** `transformResponsesStreamToChat` only builds the final chunk on `response.completed` (`openai-compat/stream-transforms.ts:384-399`). There is no `response.incomplete` case.
- **Simulated:** on 13 Responses-upstream providers, for `max_output_tokens` and content-filter stops:
  - chat/stream ends with no `finish_reason`, no final chunk and no usage, so the response reaches billing with no usage at all;
  - chat/buffered reports `stop`.
- **Impact:** every truncated answer from Groq, DeepSeek V4, Fireworks, BytePlus, Meta, Ambient, Venice and the Claude path is unbilled for streaming Chat clients, and mislabelled for buffered ones.
- **Fix:** handle `response.incomplete` like `response.completed`, mapping `incomplete_details.reason`. **Effort:** S.

**N7. Mid-stream upstream errors are delivered as successes.**
- **Mark:** simulated.
- **Evidence:**
  - The chat-to-chat transform ignores frames that are neither chat nor Responses payloads, so an OpenAI-style `{"error":…}` frame is dropped (`openai-compat/stream-transforms.ts:535-547`).
  - `mapResponsesStatusToAnthropicStopReason` returns `null` for `failed` (`openai-compat/index.ts:840`), and N5 then turns that into `end_turn`.
- **Simulated outcomes:**

  | Upstream | Client surface and mode | What the client gets |
  |---|---|---|
  | chat-dialect providers (59) | chat/buffered | `stop` |
  | chat-dialect providers (56) | messages (both modes) | `end_turn` |
  | chat-dialect providers (55) | responses (both modes) | `completed` |
  | Responses providers | messages/stream | `max_tokens` |
  | Claude | chat and responses | `stop` / `completed` |

  The error is surfaced only on chat/stream for chat-dialect upstreams and on responses for Responses-dialect upstreams.
- **Impact:** partial output looks complete. Retries are not triggered.
- **Fix:** propagate an error event on every encoder, and map it to `failed`, an error, or an HTTP error for buffered clients. **Effort:** M.

**N8. Claude `thinking` signatures and `redacted_thinking` are lost on every surface, including `/v1/messages`.**
- **Mark:** simulated.
- **Evidence:** the Claude stream reaches a Messages client as `thinking_delta` frames with no `signature_delta`. The thinking block starts with an empty `thinking` and no `signature`. This happens because the Anthropic executor converts to Responses events and re-encodes (`executors/anthropic/text-generate/stream-transformer.ts:199-203,266-276`; `protocols/stream/encode.ts`).
- **Simulated:** signature, `redacted_thinking` and citations are lost on 5 Claude providers × 3 surfaces × 2 modes.
- **Impact:** Anthropic requires the signed thinking block to be replayed with tool results. So a Messages-API agent (for example Claude Code pointed at Phaseo) using extended thinking with tools fails from step 2.
- **Relation to in-flight work:** this widens the reasoning-round-trip PR (#4) to the Messages surface.
- **Fix:** pass `signature_delta` and `redacted_thinking` through; emit them on Messages. **Effort:** M.

**N9. SambaNova and Ambient's Kimi route get `input_items` instead of `input`.**
- **Mark:** simulated. Whether the providers reject it is needs-live.
- **Evidence:**
  - `usesOpenAIResponsesShape` (`openai-compat/transform.ts:79-100`) decides between `input` and `input_items` (`:234`).
  - SambaNova is on `/responses` (`providers/sambanova/config.ts:10`) but not on that list. Its quirk does not rename the field (`providers/sambanova/quirks.ts`). Groq and Fireworks rename it in their quirks.
  - SambaNova's own spec requires `input` and Responses-style flat tools. The gateway sends `input_items` and chat-style `tools[].function`.
  - Scaleway (no active routes) and Ambient's `moonshotai/kimi-k2.7-code` get the same shape.
- **Impact:** probably a 400 on every SambaNova request (7 active routes).
- **Fix:** use the OpenAI shape for these providers. **Effort:** S.

**N10. Our Chat Completions schema rejects or strips shapes the OpenAI SDKs send.**
- **Mark:** simulated, traced.
- **Evidence:**
  - Assistant `content` is optional but not nullable (`core/schemas.ts:818-823`). Replaying an SDK assistant tool-call message (`content: null`) returns `400 messages.2.content: Invalid input`.
  - `MessageContentPartSchema` (`core/schemas.ts:549-557`) has no `file` part, so `file_data` and `file_id` parts return 400.
  - `TextPartSchema` (`:495-498`) is a plain `z.object`, so `cache_control` and `prompt_cache_breakpoint` on parts are stripped before decode.
- **Simulated:** on all 68 routable providers.
- **Fix:** allow `content: null`, add a `file` part, and pass the part-level cache keys through. **Effort:** S.

**N11. Documented `/v1/messages` parameters return 400.**
- **Mark:** simulated, traced.
- **Evidence:**
  - The Messages allowlist (`pipeline/before/textParamPolicy.ts:287-317`) has no `session_id`, `reasoning`, `provider_options` or `prompt_cache_key`. `keyToCanonicalParam` maps two of them (`:337-342`).
  - `AnthropicMessagesRequest` in `apps/docs/openapi/v1/openapi.yaml` documents `session_id`, `reasoning` and `provider_options`.
  - Every request using them gets `unknown_param`. That includes the desktop app's planned `provider_options.anthropic.cache_control` on `/v1/messages`.
  - The native Anthropic value `service_tier: "auto"` fails zod. `output_config`, `output_format`, `container`, `mcp_servers` and `context_management` return `unknown_param`. These are Anthropic API parameters, not in our spec.
- **Fix:** add the documented keys to the allowlist; decide on the Anthropic-native ones. **Effort:** S.

**N12. Vertex Gemini tool loops are malformed beyond the missing `functionCall`.**
- **Mark:** simulated. Vertex's response is needs-live.
- **Evidence:** the captured `contents` for the step-2 agent request on `google/gemini-3.8-flash`:
  - the model turn carries only `{text: reasoning, thought: true}` and an empty `{text: ""}`, with no `functionCall` (this is R2);
  - each `functionResponse` is in its own user turn;
  - an array tool result is sent as `functionResponse.response = [...]`, which Gemini requires to be an object (Vertex spec: `type_mismatch`);
  - thought text is replayed without a signature.
- **Code:** `executors/google-vertex/text-generate/index.ts:420-467`.
- **Fix:** together with R2: group `functionResponse` parts into one turn, wrap arrays as `{content: […]}`, and drop thought parts without signatures. **Effort:** M.

### Medium

**N13. The gateway invents upstream fields the client did not send** (simulated, traced).

| Field | Providers | Evidence | Effect |
|---|---|---|---|
| `temperature: 1` | 61 | zod default, `core/schemas.ts:869` | Overrides provider and model defaults (DeepSeek, Qwen and Llama recommend lower values) on every Chat request. |
| `parallel_tool_calls: true` | 57 | – | Sent even with no tools. |
| `logprobs: false` | 47 | `transform-chat.ts:127` | – |
| `prompt_cache_key: null` | 57 Responses upstreams | `core/schemas.ts:347-349`, `transform.ts:350` | Moonshot, Relace and Sail Research specs type it as a string, so `null` fails type checks. Confirms G-F7. |
| `safety_identifier: null` | 52 | `transform.ts:353` | – |
| `stream_options.include_usage` | many | `openai-compat/index.ts:116-118` | Sent to providers whose spec lacks it (for example Groq and xAI Responses). |

**N14. `service_tier` and tool types are forwarded without checking the provider's schema** (simulated).
- Gateway tier names (`standard`, `fast`, `ultrafast`, `priority`, `batch`) reach providers whose enum differs. Examples: Groq `auto|default|flex`; Anthropic expects `auto|standard_only`.
- Hosted and custom tools (`web_search`, `file_search`, `mcp`, `custom`) reach Chat providers that accept only function tools. Examples: Baseten, Cerebras, DeepInfra, Friendli, Inception (`tools[].function` missing).
- Responses-shaped custom tools reach 25 Chat bodies.

**N15. Citations and metadata are lost on the way back** (simulated).
- `url_citation` annotations and `system_fingerprint` are lost for buffered Chat clients on 59 chat-dialect providers.
- Citations are lost on the Responses and Messages surfaces for all dialects.
- Claude citations are lost everywhere.
- Buffered Responses clients of 37 chat-dialect providers lose `reasoning_content` text.

**N16. When per-frame pricing throws, the client gets the raw upstream frame** (simulated).
- `pipeline/after/stream.ts:286-299` prices every usage frame inline.
- `pipeline/after/streaming.ts:419` swallows rewrite errors and forwards the frame unrewritten. The client then sees the upstream id instead of the gateway id, and unshaped usage.
- Seen on 61 provider × surface combinations where B1's `pricing_rule_missing` fires.

**N17. Bedrock sends non-Claude models to `/anthropic/v1/messages` for Messages clients** (simulated, needs-live).
- Gemma and GPT routes on Bedrock Mantle go to `https://bedrock-mantle…/anthropic/v1/messages` when the client uses `/v1/messages`.
- AWS documents that path for Claude only.

**N18. DeepSeek V4 is sent to `/responses`** (traced, needs-live).
- `providers/openai-compatible/config.ts:354-362` routes four DeepSeek V4 models to `/responses` on `api.deepseek.com`.
- DeepSeek's API reference documents only chat completions.
- If DeepSeek has no Responses endpoint, all V4 traffic fails over.

**N19. OpenAI client `metadata` is replaced on the Responses and Messages surfaces** (simulated).
- `executors/openai/text-generate/index.ts:572-589` sets `metadata.phaseo_request_id` per request.
- Client `metadata` is dropped on Chat.
- This is the only per-request non-determinism found. It is outside the prompt, so it does not affect caching.

**N20. Prefix stability holds** (simulated). Across three-step agent conversations, the tools, system prompt and every earlier history item are byte-identical between steps (cache markers aside) on all 68 routable providers. This confirms the review's H6 conclusion.

### Non-text families and routing (traced; full detail in `AUDIT-traced-nontext.md`)

These come from the read-only sub-audit. I re-checked C1 (N2 above) in code; the rest are as traced, with `file:line` evidence in that file.

- **H1.** An exception after a successful upstream response (for example adapter-level `computeBill` throwing `pricing_rule_missing` in image, OCR, speech or music adapters) is treated as an attempt failure, so the next provider is called and Phaseo pays twice (`pipeline/execute/index.ts:1398-1466`; only `video.generate` stops fallback).
- **H2.** Synchronous media with a configured but unmatched meter, and nothing else priced, costs $0 with no alert (`pipeline/pricing/engine.ts:891-910`). Examples: Grok Imagine without `resolution`, Together Whisper and Azure MAI Transcribe priced on minutes that nothing emits.
- **H3.** Speech-to-text is billed from file-size estimates, ignoring OpenAI's `usage.seconds` and `input_token_details.audio_tokens` (`providers/openai/endpoints/audio-transcription-usage.ts:72-143`).
- **M1–M6:**
  - pass-through forwards every upstream response header to clients (`pipeline/after/streaming.ts:22-27`);
  - gateway-made 400s and 502s fail over and count against provider health;
  - client `anthropic-beta` headers are dropped (`executors/anthropic/text-generate/index.ts:209-220`);
  - Fireworks images go to an undocumented path;
  - Cohere rerank is billed per request, not per search unit;
  - the image stream finaliser misses `output_image` for non-GPT-image models.
- **Batch, video and realtime** are well guarded; only low-severity gaps were found.

### Low

- **Claude `developer` and later `system` messages** are dropped or replaced (simulated: `chat.content.developer-role` and `chat.content.second-system` drop `$.messages[0].content`). This confirms A-F8.
- **`n` > 1** is dropped silently on most providers instead of being rejected (simulated).
- **Vertex open models (`openai/gpt-oss-120b`)** reject every reasoning option locally (`unsupported_parameter`). Clients that always send `reasoning` cannot use those routes. This is an intended guard, but it is not reflected in catalogue params.

## 3. Cache review: confirmed, disproved, refined

| Review item | Result | Evidence |
|---|---|---|
| **B1** cache meter with no price row throws | **Confirmed** | The sweep prices the provider's real "max" usage against each active route's catalogue card: 507 of 1,279 active routes throw (427 read, 57 write, 22 both). The largest counts: Venice 79/105, Alibaba 71/82, Bedrock 46/65, SiliconFlow 46/63, ModelScope 38/38, DeepInfra 34/81, Nebius 29/29, Baidu 18/24, IonRouter 17/17, OpenAI 17/57 (legacy models and `-pro` models). This only bites where the provider actually reports cache tokens for that model. Stream frames are also forwarded unrewritten (N16). |
| **B2** streamed Claude drops writes and under-bills input | **Confirmed and extended** | Because buffered clients are materialised streams, buffered Chat and Responses lose writes too. Chat/stream also loses reads (N3), and Messages loses both reads and writes (N4). |
| **B3** writes counted inside input | **Stream half confirmed; non-stream half not reachable** | OpenAI, OpenAI EU, Alibaba and Moonshot writes are billed at 1× input on Chat and Responses (`cacheWrite` −3,019, `uncachedInput` +3,019). The "1× + 1.25×" double billing in `usage/text.ts:140-154` runs only on the executors' non-stream branch, which text surfaces never take (see "What production does"). Batch may still use it. |
| **B4** top-level `cached_tokens` ignored | **Partly confirmed** | StepFun's top-level `cached_tokens` is lost on the Responses surface only; Chat keeps it. |
| **R1** Bedrock Claude to Mantle OpenAI paths | **Confirmed** | Captured URLs: Chat goes to `bedrock-mantle…/v1/chat/completions`, Responses to `…/v1/responses`. Only Messages goes to `/anthropic/v1/messages`. |
| **R2** Vertex drops assistant `functionCall` | **Confirmed** | See N12 for the body and the additional defects. |
| **R4** `prompt_cache_breakpoint` reaches Claude as an invalid `cache_control` | **Disproved for Chat** | Zod strips the key from Chat parts (`core/schemas.ts:495-498`). A breakpoint on a user or system part makes no upstream change on Anthropic, OpenAI or DeepSeek. The real defect is that it never reaches any provider (N10). |
| **R5** documented `cache_control` rejected or dropped | **Confirmed, root cause refined** | Top-level `cache_control` returns 400 `unknown_param` on all three surfaces. Per-part markers on Chat are stripped by zod, not by `normalizeContent`. Native Messages blocks pass through. |
| **R6** `user` sent to Anthropic as `metadata.user` | **Confirmed (shape)** | `chat.param.user` produces `+ $.metadata.user`. Anthropic's spec allows only `metadata.user_id`; whether the API returns 400 is needs-live. |
| **R7** cache key as a routing constraint | **Partly confirmed** | In the catalogue snapshot, `prompt_cache_key` is unsupported for LongCat, SambaNova and Tensorix, so those routes are deprioritised. Scaleway, Perplexity and Reflection have no active routes in the snapshot. |
| **R8** `cherryPickIRParams` drops tools and `prompt_cache_key` | **Disproved** | Production passes `v2_route_capabilities.params` as an array or keyed object (`pipeline/before/context.ts:924`). The allowlist reads `.request.allowlist`, `.request.params` or `.params` (`executors/_shared/text-generate/shared.ts:19-22`), which never exist, so nothing is filtered. Simulated: `tools` and `prompt_cache_key` change the upstream body on Cerebras, IonRouter, AkashML, DeepInfra, GMI and Cloudflare. LongCat's own quirk does strip both, as reported. |
| **H6** prefix stability | **Confirmed** | 0 unstable prefixes on 68 providers. |
| **G-F7** `prompt_cache_key: null` | **Confirmed** | Sent to 57 Responses upstreams (N13). |
| **G-F8** top-level `prompt_cache_retention` ignored | **Confirmed** | No upstream effect for OpenAI on Chat. |

## 4. What still needs a live test

Use a provider-pinned request with `debug.return_upstream_request`. Do not run any of these without the user's go-ahead.

1. **Gemini thinking billing (N1).** Send `POST /v1/chat/completions` with `{"model":"google/gemini-3.8-flash","provider":{"only":["google-vertex"]},"messages":[{"role":"user","content":"Plan a 5-step proof that √2 is irrational."}],"reasoning":{"effort":"high"}}`. Compare `usageMetadata.thoughtsTokenCount` with the billed `output_text_tokens`.
2. **SambaNova `input_items` (N9).** Any request pinned to `sambanova`. Expect a 400 if SambaNova enforces `input`.
3. **DeepSeek V4 on `/responses` (N18).** A request pinned to `deepseek` with `deepseek/deepseek-v4-flash`. Check whether the upstream returns 404.
4. **Bedrock non-Claude Messages (N17).** `POST /v1/messages` with `google/gemma-3-12b` pinned to `amazon-bedrock`.
5. **Anthropic `metadata.user` (R6).** `POST /v1/chat/completions` with `user` set, pinned to `anthropic`.
6. **Vertex tool loop (N12, R2).** Replay `chat.agent.step2` from `src/client-requests.ts` pinned to `google-vertex` with a Gemini model.
7. **Responses-upstream truncation (N6).** `max_tokens: 16` on Groq `openai/gpt-oss-120b`, streamed to `/v1/chat/completions`. Check for a `finish_reason` and a billed request row.
8. **The non-text items in `AUDIT-traced-nontext.md` section 4:** TTS billing rows, the Grok Imagine double charge, STT minutes.

## 5. Per-provider matrix

Counts are from the simulator. Full lists per provider are in `results/MATRIX.md` and `results/summary.json`; regenerate `results/providers/*.json` with the simulator.

**Column notes:**
- **Dropped params:** documented parameters with no upstream effect, including ones the provider does not support.
- **Invented:** upstream fields the client never sent.
- **Mistranslated:** schema type, enum or required violations, changed values and finish mismatches.
- **Unknown to spec:** fields the provider's schema does not define.
- **Lost (resp):** response fields lost across surfaces and modes.
- **Upstream dialects:** `oai-chat` (OpenAI Chat), `oai-responses` (OpenAI Responses), `anthropic` (Anthropic Messages), `gemini` (generateContent), `gemini-int` (Interactions).

| Provider | Active routes | Upstream | Spec | Verdict | Dropped params | Invented | Mistranslated | Unknown to spec | Lost (resp) | Pricing throws (sampled/sweep) |
|---|---|---|---|---|---|---|---|---|---|---|
| openai | 57 | oai-chat, oai-responses | own | partial | 5 | 14 | 25 | 10 | 9 | 0/17 |
| openai-eu | 9 | oai-chat, oai-responses | own | partial | 5 | 13 | 28 | 10 | 9 | 0/2 |
| anthropic | 11 | anthropic | own | broken | 27 | 6 | 28 | 8 | 24 | 0/0 |
| anthropic-us | 1 | anthropic | own | broken | 27 | 9 | 28 | 8 | 24 | 0/0 |
| anthropic-aws | 2 | anthropic | own | broken | 27 | 6 | 28 | 5 | 24 | 0/0 |
| anthropic-aws-us | 1 | anthropic | own | broken | 27 | 9 | 28 | 5 | 24 | 0/0 |
| ai21 | 2 | oai-chat | own | broken | 9 | 5 | 2 | 36 | 0 | 0/0 |
| akashml | 9 | oai-chat | own | broken | 7 | 8 | 13 | 1 | 12 | 4/2 |
| arcee-ai | 8 | oai-chat | own | broken | 7 | 8 | 13 | 12 | 12 | 4/2 |
| azure | 10 | oai-chat, oai-responses | own | broken | 7 | 8 | 14 | 41 | 7 | 0/1 |
| baidu | 24 | oai-chat, oai-responses | hand-written/baseline | broken | 5 | 11 | 16 | 25 | 7 | 0/18 |
| reka | 3 | oai-chat | own | broken | 10 | 8 | 38 | 59 | 12 | 0/0 |
| streamlake | 2 | oai-chat | baseline | broken | 10 | 8 | 31 | 13 | 12 | 0/0 |
| upstage | 4 | oai-chat | hand-written | partial | 8 | 8 | 13 | 34 | 12 | 0/1 |
| wafer | 6 | oai-chat | hand-written | partial | 9 | 8 | 13 | 24 | 12 | 0/0 |
| alibaba-cloud | 82 | oai-chat | hand-written | partial | 8 | 8 | 13 | 24 | 12 | 0/71 |
| atlascloud | 60 | oai-chat | baseline | broken | 10 | 8 | 31 | 13 | 12 | 0/8 |
| baseten | 13 | oai-chat | own | broken | 8 | 8 | 30 | 30 | 11 | 0/0 |
| byteplus | 17 | oai-responses | baseline | broken | 7 | 4 | 37 | 19 | 12 | 0/1 |
| cerebras | 3 | oai-chat | own | broken | 10 | 7 | 30 | 31 | 11 | 8/2 |
| cloudflare | 3 | oai-chat | baseline | broken | 8 | 8 | 31 | 13 | 11 | 0/1 |
| cohere | 4 | oai-chat | hand-written | broken | 22 | 4 | 13 | 8 | 12 | 4/4 |
| canopy-wave | 10 | oai-chat | hand-written | partial | 10 | 8 | 13 | 55 | 12 | 0/0 |
| tensorix | 20 | oai-chat | hand-written | partial | 10 | 8 | 13 | 40 | 12 | 0/0 |
| google-ai-studio | 20 | gemini-int | none | partial | 27 | 3 | 15 | 0 | 19 | 0/11 |
| spacex-ai | 5 | oai-responses | own | broken | 11 | 10 | 38 | 21 | 12 | 0/0 |
| friendli | 7 | oai-chat | own | broken | 7 | 8 | 33 | 42 | 12 | 4/1 |
| deepseek | 5 | oai-responses | baseline | broken | 20 | 1 | 33 | 13 | 12 | 0/0 |
| gmicloud | 45 | oai-chat | hand-written | partial | 10 | 8 | 13 | 42 | 11 | 0/0 |
| inception | 3 | oai-chat | own | broken | 8 | 8 | 26 | 56 | 11 | 0/0 |
| inflection | 2 | oai-chat | baseline | broken | 10 | 8 | 31 | 13 | 12 | 4/2 |
| ionrouter | 17 | oai-chat | hand-written | broken | 10 | 8 | 13 | 52 | 12 | 8/17 |
| longcat | 1 | oai-chat | hand-written | partial | 33 | 4 | 13 | 4 | 11 | 0/0 |
| ambient | 4 | oai-responses | own | broken | 9 | 16 | 26 | 37 | 12 | 0/0 |
| avian | 13 | oai-chat | hand-written | partial | 10 | 8 | 13 | 58 | 12 | 0/0 |
| minimax | 7 | oai-chat | hand-written | broken | 11 | 8 | 13 | 41 | 15 | 0/1 |
| minimax-lightning | 3 | oai-chat | hand-written | broken | 11 | 8 | 13 | 41 | 15 | 0/0 |
| modelscope | 38 | oai-chat | baseline | broken | 10 | 8 | 31 | 13 | 12 | 4/38 |
| morph | 15 | oai-chat | own | broken | 8 | 8 | 29 | 64 | 12 | 0/8 |
| morpheus | 1 | oai-chat | own | broken | 9 | 8 | 18 | 22 | 12 | 4/1 |
| nebius-token-factory | 29 | oai-chat | own | broken | 8 | 8 | 45 | 11 | 12 | 12/29 |
| parasail | 35 | oai-chat | hand-written | broken | 10 | 8 | 13 | 38 | 12 | 0/0 |
| poolside | 3 | oai-chat | hand-written | broken | 8 | 8 | 13 | 58 | 11 | 4/3 |
| z-ai | 18 | oai-chat | own | broken | 8 | 14 | 37 | 49 | 15 | 0/1 |
| xiaomi | 3 | oai-responses | baseline | broken | 8 | 4 | 33 | 16 | 12 | 0/1 |
| mistral | 24 | oai-chat | own | broken | 12 | 7 | 26 | 14 | 12 | 4/10 |
| mistral-eu | 1 | oai-chat | own | partial | 12 | 7 | 26 | 14 | 12 | 0/0 |
| moonshotai | 10 | oai-chat | own | broken | 11 | 7 | 30 | 51 | 11 | 2/6 |
| aion-labs | 4 | oai-chat | hand-written | partial | 10 | 8 | 13 | 44 | 12 | 0/1 |
| amazon-bedrock | 65 | oai-chat, oai-responses, anthropic | baseline | broken | 10 | 8 | 21 | 9 | 11 | 4/46 |
| google-vertex | 38 | anthropic, gemini, oai-chat | baseline/own | broken | 30 | 15 | 78 | 27 | 45 | 4/7 |
| google-vertex-eu | 4 | anthropic, gemini | baseline/own | broken | 30 | 7 | 60 | 14 | 44 | 4/1 |
| deepinfra | 81 | oai-chat | own | broken | 8 | 8 | 33 | 38 | 11 | 12/34 |
| io-net | 34 | oai-chat | own | broken | 10 | 8 | 26 | 1 | 12 | 0/7 |
| fireworks | 21 | oai-responses | own | partial | 9 | 4 | 16 | 30 | 12 | 0/1 |
| groq | 7 | oai-responses | own | broken | 14 | 2 | 60 | 34 | 12 | 0/1 |
| novita | 93 | oai-chat | hand-written | partial | 10 | 8 | 13 | 29 | 11 | 0/0 |
| relace | 1 | oai-chat | own | broken | 10 | 8 | 14 | 0 | 12 | 4/1 |
| sambanova | 7 | oai-responses | own | broken | 19 | 13 | 32 | 14 | 12 | 9/6 |
| sail-research | 5 | oai-responses | own | broken | 10 | 10 | 36 | 16 | 12 | 0/0 |
| siliconflow | 63 | oai-chat | baseline | broken | 7 | 8 | 31 | 20 | 11 | 8/46 |
| stepfun | 15 | oai-chat | hand-written | partial | 7 | 8 | 13 | 44 | 11 | 0/0 |
| together | 30 | oai-chat | own | broken | 9 | 8 | 21 | 48 | 12 | 8/14 |
| venice | 105 | oai-responses | own | broken | 9 | 4 | 25 | 41 | 12 | 4/79 |
| weights-and-biases | 30 | oai-chat | baseline | broken | 8 | 8 | 31 | 16 | 11 | 0/3 |
| meta | 2 | oai-responses | baseline | broken | 7 | 4 | 34 | 19 | 12 | 0/0 |
| ovhcloud | 4 | oai-responses | own | broken | 7 | 4 | 39 | 40 | 12 | 3/1 |
| sakana | 2 | oai-responses | baseline | broken | 7 | 4 | 37 | 16 | 12 | 0/0 |

Not routable (no active catalogue routes; simulated with inactive routes or a placeholder): private-model, darkbloom, inference-net, doubleword, mara, switchpoint, wafer-zdr, tencent-cloud, bytedance-seed, chutes, clarifai, openrouter, crusoe, featherless, hyperbolic, infermatic, ionrouter-kimi, ionrouter-minimax, mancer, empiriolabs, scaledown, alibaba, qwen, nebius-token-factory-eu-north-1, nebius-token-factory-us-central-1, nvidia, phala, zai, moonshotai-turbo, liquid, liquid-ai, perplexity, venice-e2ee, scaleway, thinking-machines, reflection.
