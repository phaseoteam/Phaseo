# @phaseo/sdk

## 4.0.0

### Major Changes

- [#2838](https://github.com/phaseoteam/Phaseo/pull/2838) [`fc3ad0e`](https://github.com/phaseoteam/Phaseo/commit/fc3ad0e3cb95e5d677e87f469a7ef5d736bc853b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add `GET /v1/models?format=openai` for OpenAI-compatible model discovery. Native JSON remains the default; OpenAI format returns all filtered models unless an explicit limit is supplied.
  
  Generated TypeScript and Python model-list responses now include both native and OpenAI shapes. Typed consumers must narrow the response before accessing format-specific fields.

### Minor Changes

- [#2425](https://github.com/phaseoteam/Phaseo/pull/2425) [`9b68ad3`](https://github.com/phaseoteam/Phaseo/commit/9b68ad32bbad415bd591c01d2d46841fe43119d3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add TypeSafe Jev structured Decisions support through the `/v1/decisions` gateway endpoint, generated SDK operations, catalog pricing, and a dedicated Decisions playground.

- [#3164](https://github.com/phaseoteam/Phaseo/pull/3164) [`bd24fb5`](https://github.com/phaseoteam/Phaseo/commit/bd24fb571ae1e69fd1f84a03454045049d9bf4e5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - API keys accept and return `storage_locations`: where you keep the key (for example `railway`, `vercel`, `github`, `1password`), up to 8 ids. Set it when creating or updating a key, clear it with `null` or `[]`; a rotated key keeps it. Revoked keys now answer `409 key_revoked` when asked to turn back on.

- [#2503](https://github.com/phaseoteam/Phaseo/pull/2503) [`280687b`](https://github.com/phaseoteam/Phaseo/commit/280687b57f92c63322f2765c197dbd82303e2330) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep chat reasoning choices compatible with model capabilities and expose the `instant` effort only in generated OpenAI-compatible request types.

- [#2624](https://github.com/phaseoteam/Phaseo/pull/2624) [`a134fa5`](https://github.com/phaseoteam/Phaseo/commit/a134fa542da6cb529b1827aa84a85d88a31d2edf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Ultrafast tier to gateway routing and the OpenAPI SDKs, and display it with a distinct badge in model and provider pricing.

- [#2456](https://github.com/phaseoteam/Phaseo/pull/2456) [`65b3d54`](https://github.com/phaseoteam/Phaseo/commit/65b3d545d0ee9d476447ce7dc0909ea36e3aa0d8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add native pagination, resumable job handles, and full-request live capability preflight across every gateway SDK.

- [#3041](https://github.com/phaseoteam/Phaseo/pull/3041) [`94aa574`](https://github.com/phaseoteam/Phaseo/commit/94aa57406d3b3f8c67caf80dd584b99e9b6a8e38) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add typed extraction requests through `/extractions`, with Cloudflare Clairic support, input-token accounting and TypeScript/Python client resources.

- [#2809](https://github.com/phaseoteam/Phaseo/pull/2809) [`0a47362`](https://github.com/phaseoteam/Phaseo/commit/0a473627713fffd53ea55d52ec6f97b584884f1b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add audio and video inputs to the Decisions API for Clef Omni, with public HTTPS media references, provider capability checks, bounded downloads, and aggregate input-token billing.

- [#2676](https://github.com/phaseoteam/Phaseo/pull/2676) [`d8ae83c`](https://github.com/phaseoteam/Phaseo/commit/d8ae83ccc9d6626eeffa64a8c219ae8df2bc5bde) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Support Cloudflare Clef and Clef Flash typed decisions with embedded image inputs, provider limit validation, and usage accounting. Add optional decision images to the public API and generated SDKs.

- [#2920](https://github.com/phaseoteam/Phaseo/pull/2920) [`d14aab2`](https://github.com/phaseoteam/Phaseo/commit/d14aab2d7db12ccbbb089daa0ff8e95eb8859c6e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Support TypeSafe image inputs on Decisions, add a separate Box question and answer type, and expose experimental long context through `provider_options.typesafe.long_context`.

- [#2451](https://github.com/phaseoteam/Phaseo/pull/2451) [`1a5fbcc`](https://github.com/phaseoteam/Phaseo/commit/1a5fbcc3b53e6ac0b0402725c10ac653a81dce1d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add live model endpoint capability discovery and structured parameter support
  reports to every gateway SDK. Reports identify fully supported,
  partially supported, unsupported, and unknown parameters, validate advertised
  constraints, and return the provider routes that accept the complete parameter
  set.

- [#2925](https://github.com/phaseoteam/Phaseo/pull/2925) [`e03d835`](https://github.com/phaseoteam/Phaseo/commit/e03d835eee473288e47045fab23f33d0c875b5b4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - The workspace settings API reads and writes retired model routing: `model_successor_redirect_enabled`, `model_successor_price_policy` (`never`, `limit` or `any`) and `model_successor_max_price_increase_percent`. Notification routes include the `model_substitution` event.

- [#2916](https://github.com/phaseoteam/Phaseo/pull/2916) [`d6f8d0a`](https://github.com/phaseoteam/Phaseo/commit/d6f8d0a5be5eed5b92fe43faf30b7e5704145f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a weak `ETag` (`W/"…"`) to `GET /v1/models` JSON and OpenAI-format responses and answer a matching `If-None-Match` with a body-less `304`, which saves transfer and parsing when clients poll the model list. The `ETag` ignores `gateway_region`, which is why it is weak. Each model offer now lists the `service_tiers` its provider route accepts (`flex`, `priority`, `standard`, `ultrafast`), derived from the same executable pricing the gateway uses (current, USD, with a billable meter); prices stay standard-tier.

- [#2744](https://github.com/phaseoteam/Phaseo/pull/2744) [`5cc4d2f`](https://github.com/phaseoteam/Phaseo/commit/5cc4d2faa1440b62f07a6c5774f44adc1a066d62) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make OpenAI-compatible input and ordered question/answer arrays the preferred Decisions contract across the gateway, SDKs, docs, and playground. Support GPT-6 Luna with inline images, typed boolean choices, refusal handling, and input-only billing while preserving legacy state/question-map callers and SDK type names.

- [#3085](https://github.com/phaseoteam/Phaseo/pull/3085) [`a64f1b2`](https://github.com/phaseoteam/Phaseo/commit/a64f1b25af371ecc3aeb7869b4fa2fe676dd19bd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add prompt templates to presets. A preset's `prompt` block holds messages with `{{variable}}` placeholders, the variables they take, and optional tools and response format. Chat completions, responses and messages requests send `prompt: { id: "@preset", variables: { … } }`; the gateway checks the values, renders the messages before routing and guardrails, and returns every missing, mistyped or unknown variable in one 400. Templates are validated when a preset is saved or published, and variable names (not values) are recorded on request logs.

- [#2888](https://github.com/phaseoteam/Phaseo/pull/2888) [`dafbc58`](https://github.com/phaseoteam/Phaseo/commit/dafbc580dcda55d340613949c80939763f07215d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for named rate limit policies (requests per minute, tokens per minute, concurrent requests) and their assignments to API keys, members, departments, guardrails, or the workspace's end-user default, with new `rate_limits:read`, `rate_limits:write`, and `rate_limits:delete` scopes. The gateway does not enforce these policies yet. API keys can now be linked to a department with `department_id`. The guardrail request and spend limit fields, which were never enforced, are marked deprecated.

- [#3029](https://github.com/phaseoteam/Phaseo/pull/3029) [`c8f3bca`](https://github.com/phaseoteam/Phaseo/commit/c8f3bcaebc6c6c6f37c5f32bef03852b3e5724f1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for request classifiers (`/v1/classifiers`), with new `classifiers:read`, `classifiers:write`, and `classifiers:delete` scopes. A classifier is a workspace taxonomy of up to 12 dimensions, a model, optional instructions, a sample rate, an optional scope (keys, apps, models), and an optional monthly budget; up to 5 per workspace. The gateway does not run classifiers yet.

- [#2858](https://github.com/phaseoteam/Phaseo/pull/2858) [`6f98576`](https://github.com/phaseoteam/Phaseo/commit/6f985766f09ad3c626a3a3fdbcb65b265663c181) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Honour the request-level `models` fallback list on every inference endpoint. `model` stays required and is the primary model; the optional `models` array lists up to 25 fallbacks tried in order when an attempt fails with `429`, `500`, `502`, `503`, or `504`. Each fallback reruns the full pipeline, and logs, usage, billing and the response `model` reflect the model that served the request. Streams fall back only before the first byte, and video and music jobs only at submission. Realtime sessions, batches and council runs reject `models` with a `400` instead of ignoring it.

- [#2443](https://github.com/phaseoteam/Phaseo/pull/2443) [`d97391a`](https://github.com/phaseoteam/Phaseo/commit/d97391ae0d33702621b35d350f88df31c7f100d5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add shared SDK request controls and diagnostics, native Python async resources,
  resumable media jobs, structured output and streaming helpers, model capability
  preflight, and deterministic testing transports. Export submitted room requests
  as runnable TypeScript or Python and link requests to dashboard traces.
  
  Python JSON requests now use HTTPX. Catch PhaseoHTTPError (or
  httpx.HTTPStatusError) instead of urllib.error.HTTPError, and use error.status
  for the HTTP status; error.code contains the API error code.

- [#2434](https://github.com/phaseoteam/Phaseo/pull/2434) [`2a980af`](https://github.com/phaseoteam/Phaseo/commit/2a980af08a30469407228b8d80915a5a10e67e04) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add handwritten music, video, and batch submit-and-wait and wait-by-ID helpers with progress callbacks, configurable polling, local cancellation, and structured timeout and job-failure errors. Add Python music resource methods. Preserve direct HTTP operations and full terminal responses, including usage, billing, and per-request batch failures.

- [#3052](https://github.com/phaseoteam/Phaseo/pull/3052) [`11b4cfd`](https://github.com/phaseoteam/Phaseo/commit/11b4cfdd8230bcee8b06fb158b0480b33073ecb4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add `reasoning` to `ChatMessage`, alongside `reasoning_content`, and `signature` and `format` to `ResponsesInputItem`, so reasoning items can carry a provider signature. Add the `ResponsesReasoningTextPart` model (`type: "reasoning_text"`) as a new member of the `ResponsesOutputContentPart` union.
  
  No SDK field or type is renamed or removed, but the API now returns reasoning text in Responses `reasoning` items as `reasoning_text` parts instead of `output_text` parts. Code that picks reasoning text by checking for an `output_text` part, or that handles every `ResponsesOutputContentPart` as `output_text`, should also handle `ResponsesReasoningTextPart`; the text is still in `text`.

- [#3087](https://github.com/phaseoteam/Phaseo/pull/3087) [`d4d8dbd`](https://github.com/phaseoteam/Phaseo/commit/d4d8dbdd67e651245a51c8c1bdfc281660241c74) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Attribute workspace spend to people and departments for the coming spend rules. The 15-minute usage rollup now records who made each request (the key's creator, or the OAuth user), workspaces gain a department spend attribution setting (`all` departments a person belongs to, or the `primary` one only), and notification settings in the control API and account settings expose it as `spend.department_attribution`. Usage overview totals are unchanged.

- [#3094](https://github.com/phaseoteam/Phaseo/pull/3094) [`577c773`](https://github.com/phaseoteam/Phaseo/commit/577c773e22e75fbf0cc9e6a64dfdf9f9fb677ae3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Lay the groundwork for spend rules. Workspaces gain a billing time zone (`spend.billing_time_zone` in the control API's notification settings and in account settings, an IANA name, default `UTC`) for the calendar periods of spend rules and spend reports, and three new routable notification kinds: `spend_alert`, `spend_blocked` and `spend_report`. They can be routed to destinations now; nothing sends them yet. The database adds the spend rule tables (rules, their destinations, fired state, blocks and the evaluation queue), capped at 50 rules per workspace.

- [#2455](https://github.com/phaseoteam/Phaseo/pull/2455) [`a94e315`](https://github.com/phaseoteam/Phaseo/commit/a94e31546ec77fbcbdc708f622d2c581afec2a4d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a shared SDK transport contract with request-scoped controls, safe read retries, idempotency keys, raw response metadata, structured HTTP errors, and public request lifecycle hooks.

### Patch Changes

- [#3108](https://github.com/phaseoteam/Phaseo/pull/3108) [`5865e00`](https://github.com/phaseoteam/Phaseo/commit/5865e001bf6beba88b95016614c293a27f27ba58) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Run the Agent SDK and the core SDK in Cloudflare Workers and other runtimes without Node globals: devtools load Node modules only when enabled, `process` reads and exit handlers are guarded, and run IDs come from Web Crypto. Agent runs also treat gateway server-tool calls such as `phaseo:web_search` as already handled, keeping their calls and results in items and stream events instead of failing with "Tool not found".
  
  Streamed answers now contain only text and reasoning deltas. Tool-call argument deltas and the full text that `.done` events repeat no longer leak into them, and streamed items are taken from their done event, not the still-empty added one.
  
  String `instructions` now reach the gateway once per request. Before, the gateway client sent them twice in the `instructions` field, because the run also keeps them as its first system message.
  
  Gateway HTTP failures of a streamed turn are now `AgentGatewayError`s with their request ID and diagnostics, like non-streamed ones. Before, `@phaseo/sdk`'s own error came through unwrapped, because the SDK sends a streamed request on the first read rather than in `create()`.
  
  A failed `agent.stream()` no longer leaves an unhandled promise rejection when the caller reads only a stream and never awaits the result. A resume that is missing a decision now fails before it runs any of the approved tools.
  
  `@phaseo/sdk` has a new `modelLifecycleChecks` option (default `true`). Set it to `false` to skip the `GET /models` lookup before a model's first request. Concurrent first requests for a model now share one lookup. The Agent SDK's gateway client turns the lookup off unless `clientOptions.modelLifecycleChecks` is `true`, so each new client no longer sends an extra `GET /models`. Retired models are still refused, by the gateway, with an `AgentGatewayError`.
  
  A stream that reports an error after it started (the gateway's `error` frame, a Responses `error` event or `response.failed`) now fails the run with a 502 `AgentGatewayError`, instead of completing with partial text.

- [#3183](https://github.com/phaseoteam/Phaseo/pull/3183) [`dd31fc6`](https://github.com/phaseoteam/Phaseo/commit/dd31fc6dc341dbf7f1285aa9f31d1fc20dfcbee4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast can now stream traces into a Google BigQuery table, one row per span, signing in as a service account.

- [#3182](https://github.com/phaseoteam/Phaseo/pull/3182) [`0f19296`](https://github.com/phaseoteam/Phaseo/commit/0f19296fe142b391fddd2854026ee730e35ccf76) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast can now insert traces into a ClickHouse table, one row per span, through the HTTP interface.

- [#3105](https://github.com/phaseoteam/Phaseo/pull/3105) [`25a79cc`](https://github.com/phaseoteam/Phaseo/commit/25a79cc517e795801aaee1ea7649a5e6b12a16a5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a routable `broadcast_destination_failing` notification. When a Broadcast destination has failed five requests in a row with nothing delivered for 15 minutes, workspaces that route this alert get one message per failing streak, at most once an hour, by email, Slack, Discord, Teams or webhook.

- [#3181](https://github.com/phaseoteam/Phaseo/pull/3181) [`382725d`](https://github.com/phaseoteam/Phaseo/commit/382725d05270a9fede2ef7836f75df151fbf8591) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast can now write traces to Amazon S3 (and S3-compatible stores), Cloudflare R2 and Google Cloud Storage, as gzipped JSON lines with one row per span.

- [#2962](https://github.com/phaseoteam/Phaseo/pull/2962) [`931a9d2`](https://github.com/phaseoteam/Phaseo/commit/931a9d25ac6db2dd747972f68f55167fcfd6d606) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast can now send traces to Langfuse, Datadog LLM Observability, LangSmith and Braintrust over OpenTelemetry.

- [#3080](https://github.com/phaseoteam/Phaseo/pull/3080) [`a243f88`](https://github.com/phaseoteam/Phaseo/commit/a243f88298bc52d958676e2e9204f735e9ffed2a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast can now send traces to PostHog LLM analytics, Grafana Cloud, New Relic and Sentry over OpenTelemetry.

- [#3083](https://github.com/phaseoteam/Phaseo/pull/3083) [`8b64681`](https://github.com/phaseoteam/Phaseo/commit/8b64681f2f46b00bd6a6aaa19db7b684e54c7e9c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast can now send traces to Arize AX, Comet Opik and W&B Weave over OpenTelemetry.

- [#3091](https://github.com/phaseoteam/Phaseo/pull/3091) [`731e345`](https://github.com/phaseoteam/Phaseo/commit/731e34581f43c205fbd0a0a78b58d6db23fc1312) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast can now send traces to Axiom, Dynatrace, Elastic, Honeycomb and Respan over OpenTelemetry.

- [#3185](https://github.com/phaseoteam/Phaseo/pull/3185) [`d0f6c09`](https://github.com/phaseoteam/Phaseo/commit/d0f6c09ed8f9232e6636874dc32da9064cacefb8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Broadcast can now insert traces into a Snowflake table, one row per span, signing in with a key pair.

- [#2994](https://github.com/phaseoteam/Phaseo/pull/2994) [`030dbd0`](https://github.com/phaseoteam/Phaseo/commit/030dbd0195997330085f8a9164f233b770d5bde7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Chat `file` content part (`FileContentPart`, which needs `file_data` or `file_id`) and the `/v1/messages` `service_tier` values `auto` and `standard_only`. Chat message `content` is documented as nullable: only assistant messages that call tools may send `null`, and the TypeScript and Python types now allow it. Message and content types are otherwise unchanged in every SDK, so this is not a breaking change.

- [#3125](https://github.com/phaseoteam/Phaseo/pull/3125) [`a1b82ce`](https://github.com/phaseoteam/Phaseo/commit/a1b82ced5b6ccac4e4190abf866ef37fddb94399) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add department spend budgets (beta) at `/v1/department-budgets`. A daily, weekly or monthly budget counts the same keys and OAuth requests as department rate limits, and owners and admins get a mobile push at about 80% and again at 100%. Department budgets send alerts only and never reject requests.

- [#2646](https://github.com/phaseoteam/Phaseo/pull/2646) [`4de0d4c`](https://github.com/phaseoteam/Phaseo/commit/4de0d4c85c77c2f0e2416da12ab8ba56bd8643d3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Eleven v4 and Eleven v4 Turbo speech routes with support for ElevenLabs voice library IDs and model-specific setting validation. Expose speech configuration and v4 model IDs through the OpenAPI contract and generated SDKs.

- [#3099](https://github.com/phaseoteam/Phaseo/pull/3099) [`1569d36`](https://github.com/phaseoteam/Phaseo/commit/1569d36c4d8e9c12438216924bc49dcbdd11288e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix request and response shapes on the media endpoints:
  
  - Sora video requests without `seconds` or `size` now use OpenAI's defaults (4 seconds, 720x1280) and are billed for them, instead of being refused.
  - Voyage multimodal embeddings send base64 images and videos as data URLs, as Voyage documents.
  - Transcriptions and translations requested with `response_format` `text`, `srt` or `vtt` return the plain transcript or subtitle body instead of JSON.
  - Fireworks FLUX image generation calls Fireworks' text_to_image workflow and returns the image as `b64_json`.
  - Chat Completions returns OpenAI audio output as `message.audio` (`id`, `data`, `expires_at`, `transcript`), keeps `delta.audio` pieces in streams, and bills audio tokens at the audio input and output rates instead of also as text.
  - Chat Completions accepts an earlier audio response on an assistant message as `audio: { id }` and sends it to OpenAI and Azure OpenAI, so multi-turn audio conversations keep their context. Other providers drop it and report `messages.audio` as a dropped parameter. The OpenAPI spec and SDKs now type request messages' `audio` as `{ id }` and response messages' `audio` as `{ id, data, expires_at, transcript }` (new `ChatResponseMessage`).

- [#3165](https://github.com/phaseoteam/Phaseo/pull/3165) [`80cb991`](https://github.com/phaseoteam/Phaseo/commit/80cb991e1cab82d31aed58c3f9795a9962b0e96d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - `/v1/messages` accepts mid-conversation `role: "system"` messages, as in Anthropic's Messages API. A system message takes a string or text blocks and must come straight after a user turn (or an assistant turn ending in a server tool result) and be the last message or be followed by an assistant turn; other positions, and the beta-only `clear_at`, `output_config`, `tool_addition` and `tool_removal`, return a 400. Claude models that support these messages receive them in place, except on Microsoft Foundry; other Claude models, including Sonnet 5, and every Claude model on Microsoft Foundry receive them in the top-level system prompt, and other providers receive them as a system message. The SDKs gain an `AnthropicSystemMessage` model with text-only content, and `AnthropicMessagesRequest.messages` takes either an `AnthropicMessage` or an `AnthropicSystemMessage`.

- [#3089](https://github.com/phaseoteam/Phaseo/pull/3089) [`2a9a4d6`](https://github.com/phaseoteam/Phaseo/commit/2a9a4d617c8677af2f1951feb64ebb177ed63635) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Sign custom webhook notification deliveries. New custom webhook destinations get a `whsec_` signing secret, shown once, and every delivery (routed alerts and tests sent from a saved destination) carries `x-phaseo-timestamp` and `x-phaseo-signature`, the hex HMAC-SHA256 of `<timestamp>.<raw body>`: the same scheme as video and batch webhooks. Deliveries also carry `x-phaseo-event-id` and `x-phaseo-event-type`. Destinations created before this change have no secret and keep sending unsigned; Settings marks them **Unsigned** and offers **Generate secret**. `POST /v1/notifications/destinations/{id}/rotate-secret` generates or replaces a secret, and destinations now report `has_signing_secret` and `signing_secret_rotated_at`.

- [#3097](https://github.com/phaseoteam/Phaseo/pull/3097) [`10b5598`](https://github.com/phaseoteam/Phaseo/commit/10b55980049ce1dbb6940a6e625e1c74a94b2029) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Send more providers the prompt-cache controls they document:
  
  - `/v1/messages` accepts `prompt_cache_key`, as Chat Completions and Responses do, instead of returning 400.
  - Moonshot AI receives `prompt_cache_options` (`mode: "implicit"`, `ttl` `5m` or `1h`). A `1h` lifetime is sent only to Kimi K3 routes priced for 1-hour writes, and those writes are billed at the 1-hour rate; elsewhere it is removed and reported in `X-Phaseo-Dropped-Params`.
  - Inference.net's Claude and Gemini 2.5 models receive block `cache_control`, without a `ttl`, so they can write and read a prompt cache.
  - Baseten receives the cache key in `x-session-affinity`, and Morph in `x-session-id`.
  - xAI receives the cache key derived from `session_id` in the request body.
  - On Vertex AI, `provider_options.google.cached_content` now requires your own Vertex AI credential and returns 400 with Phaseo's, as on Google AI Studio. The request goes to the project and location in the cache's full name (`projects/{project}/locations/{location}/cachedContents/{id}`); a short name uses the `project_id` and `region` of your service-account JSON, and returns 400 without them.
  - Vertex AI requests made with your own service-account JSON now run in its `project_id`, and in its `region` when it has one (unless Google serves the model in one location only), instead of Phaseo's project.

- [#2971](https://github.com/phaseoteam/Phaseo/pull/2971) [`6dd0d40`](https://github.com/phaseoteam/Phaseo/commit/6dd0d405ce8dab52970cf2b903403cf7216c585b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Document prompt caching as the gateway now behaves: which providers cache automatically, where each cache control is sent, OpenAI-style usage with `cache_write_tokens`, the input-rate fallback for missing cache prices, and provider affinity. The OpenAPI usage schemas gain `input_tokens_details` / `prompt_tokens_details` with `cached_tokens` and `cache_write_tokens`, and the Anthropic usage schema gains its cache fields, so the generated SDK types include them.

- [#3141](https://github.com/phaseoteam/Phaseo/pull/3141) [`bf77e05`](https://github.com/phaseoteam/Phaseo/commit/bf77e055ab4e2530296d8c126e34de91bd34b44a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix provider response parsing and request translation: Mistral reasoning chunk lists are read as reasoning and text, with ThinkChunk signatures kept and replayed to the same Mistral model, Nebius Token Factory Responses streams without `event:` lines are read, TypeSafe box answers may have null confidence, Baidu Qianfan requests from every surface use Chat Completions, Reflection assistant history always carries reasoning_content, Sail Research is no longer routed flex requests, and Alibaba Cloud glm-5.3 receives only the reasoning efforts it accepts. Decision box answers now type `confidence` as nullable.

- [#3212](https://github.com/phaseoteam/Phaseo/pull/3212) [`bafabf6`](https://github.com/phaseoteam/Phaseo/commit/bafabf62ab5753b7e8d63cbb48889ff701000520) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Rate limit policies now enforce `concurrent_requests` (requests in progress at once, rejected with reason `policy_concurrent_requests`) and `fail_closed` (strict policies check their limits before sending a request and reject it with reason `policy_unavailable` when they cannot be checked).

- [#3088](https://github.com/phaseoteam/Phaseo/pull/3088) [`df924f6`](https://github.com/phaseoteam/Phaseo/commit/df924f6ab92791ee10137a21c420e397b528bcb2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enforce department assignments on workspace rate limit policies. A department policy is one allowance shared by everything that counts toward the department: keys linked to it, and otherwise the keys created by its members and their OAuth requests. An exhausted department allowance returns `429` `rate_limit_exceeded` with `limit_scope: "department"`.

- [#2946](https://github.com/phaseoteam/Phaseo/pull/2946) [`105d6d2`](https://github.com/phaseoteam/Phaseo/commit/105d6d28d5947798db8f6013034cfd0f300047ff) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `rate_limit_throttled` notification event. Workspaces that route it to a destination get at most one alert an hour when rate limit policies reject requests, with the total over the last 15 minutes and the most-rejected policies.

- [#2961](https://github.com/phaseoteam/Phaseo/pull/2961) [`65a8d88`](https://github.com/phaseoteam/Phaseo/commit/65a8d88d4211df8dc3592d0b548db5fe5b81b4f1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enforce `tokens_per_minute` on workspace rate limit policies. Each request's input and output tokens are counted when it completes, over a rolling minute, for key, member, guardrail and end-user-default assignments. An exhausted allowance returns `429` `rate_limit_exceeded` with reason `policy_tokens_per_minute`, and responses carry `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens` and `x-ratelimit-reset-tokens`.

- [#2429](https://github.com/phaseoteam/Phaseo/pull/2429) [`2b78b13`](https://github.com/phaseoteam/Phaseo/commit/2b78b13e7225b6ccb54c9c4a615b73455cdb26b6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refine the Decisions chat experience with typed question controls, local conversation history, structured result rendering, canonical Jev model identity, and complete request timing metadata. Expose provider-neutral Decisions naming across the gateway, web proxy, OpenAPI contract, and generated SDKs while keeping TypeSafe's System One terminology inside its provider adapter. Keep text generation internally streamed while preserving non-streaming client responses.

- [#3049](https://github.com/phaseoteam/Phaseo/pull/3049) [`66fcd1e`](https://github.com/phaseoteam/Phaseo/commit/66fcd1e73a3f342f680d7d2228fc038be05b9e35) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the newly documented text request and response fields to the generated models: `include_reasoning` and `prediction` on `ChatCompletionsRequest`, `context_management` and `user` on `AnthropicMessagesRequest`, and `context_management` (with `applied_edits`) on `AnthropicMessagesResponse`. `service_tier` on Chat and Responses requests now also accepts `auto`, `scale` and `null`, and `reasoning.effort` accepts `null`. No existing field is renamed or removed. In the Rust and C++ models, `service_tier` and `effort` are now nullable optionals, the same mapping those SDKs already use for other nullable fields such as `prompt_cache_key`.

- [#3055](https://github.com/phaseoteam/Phaseo/pull/3055) [`d6c8e94`](https://github.com/phaseoteam/Phaseo/commit/d6c8e94e149c3065fec766ab1043bd970e88ee28) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `ErrorObject` model (`code`, `message`, `type`, `param`, `metadata`) and the top-level `code` field to `ErrorResponse`, matching the gateway's error body. `ErrorResponse.error` still accepts the older code string, and no existing field is renamed or removed. In every SDK except Rust, no existing type changes either.
  
  In the Rust SDK, `ErrorResponse.error` changes from `String` to `serde_json::Value`, because a `String` cannot hold the error object; it holds either shape. Code that read `error` as a `String` should use `error.as_str()` for the old code string or `error["code"]` for the object. `PhaseoError::code` now also reads the old code string when a response has no `error.code` or top-level `code`.

- [#3131](https://github.com/phaseoteam/Phaseo/pull/3131) [`e31145b`](https://github.com/phaseoteam/Phaseo/commit/e31145bc30b530b6a5544a6f1ffa46fe54a1f6ee) Thanks [@DanielButler1](https://github.com/DanielButler1)! - `streamResponses` (and `responses.create` with `stream: true`) now gives a chunk the name on its SSE `event:` line as `type` when the event's data has no `type` of its own. Chunks whose data already has a `type` are unchanged.

- [#3050](https://github.com/phaseoteam/Phaseo/pull/3050) [`838bebb`](https://github.com/phaseoteam/Phaseo/commit/838bebbd2779648f6d17f16de81d3ea5dbf8db36) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the optional `cost` (US dollars) and `cost_details` fields to `Usage` and `AnthropicUsage`, and the new `UsageCostDetails` model with `upstream_inference_cost`, so typed clients can read the request cost the gateway now reports on Chat Completions, Responses, Messages and embeddings responses.
  
  `ApiKeyWithValueResponse` gains `key`, the new key's secret at the top level, the same value as `data.key`. The gateway always returns it from `POST /v1/keys`. Nothing is renamed or removed. In the Rust SDK, code that builds an `ApiKeyWithValueResponse` with a struct literal now needs to set `key` too.

- [#3051](https://github.com/phaseoteam/Phaseo/pull/3051) [`fe15146`](https://github.com/phaseoteam/Phaseo/commit/fe151469bf445622adbacba1267c196a89d58650) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `plugins` field to Chat Completions, Responses and Messages requests, with the `WebSearchPlugin` (`web`), `WebFetchPlugin` (`web-fetch`) and `ResponseHealingPlugin` (`response-healing`) models, and add `OpenAIWebSearchToolDefinition` to the accepted tool types. These are additions only; no existing type or field is renamed or removed.

- [#2773](https://github.com/phaseoteam/Phaseo/pull/2773) [`f0c2012`](https://github.com/phaseoteam/Phaseo/commit/f0c201294b5b5feffc9da8d45d6059bf0761f18d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Strengthen request policy enforcement, privacy controls, resource limits, and SDK path handling. Require a workspace privacy review before Chat resumes.

- [#2491](https://github.com/phaseoteam/Phaseo/pull/2491) [`c2c745a`](https://github.com/phaseoteam/Phaseo/commit/c2c745a3c5e5ce3fbea985ee2db2045badaa1983) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose the bounded model discovery filters on the generated model-list request.

## 3.0.0

### Major Changes

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.

### Minor Changes

- [#2009](https://github.com/phaseoteam/Phaseo/pull/2009) [`0f16f22`](https://github.com/phaseoteam/Phaseo/commit/0f16f225ee2b00a0f2c367067c623650dcb5708d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Cohere Parse v5.0, the `/v1/parse` document parsing endpoint, page metering, and generated SDK operations and models.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider credential lifecycle, filtering, routing-mode, and ordering operations.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the workspace audit event listing operation and its response models.

- [#2222](https://github.com/phaseoteam/Phaseo/pull/2222) [`24368b9`](https://github.com/phaseoteam/Phaseo/commit/24368b945c71baea0020a60ee3376abb098f0374) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose authenticated, streamed Anthropic batch result downloads and return the Phaseo download URL in batch responses. Preserve workspace ownership and avoid additional inference charges on downloads. Clarify that webhook retries only follow failed deliveries.
  
  Add TypeScript and Python streaming batch-result helpers with cancellation and early-close support for large outputs.

- [#1799](https://github.com/phaseoteam/Phaseo/pull/1799) [`129b34d`](https://github.com/phaseoteam/Phaseo/commit/129b34d857473a464486d10b6bd4aeb65aab65a3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add validated app-category attribution through request headers and the TypeScript SDK.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace notification settings, encrypted destinations, destination testing, and event-routing management APIs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add complete preset lifecycle management for drafts, versions, forks, upstream updates, publisher handles, and archival.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace member roles, secure invites, and atomic join-request management APIs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace SSO and SCIM endpoint, token, and audit management with identity add-on enforcement, generated SDKs, docs, and audit events.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add typed workspace settings and versioned dynamic-route management APIs across the gateway, documentation, and generated SDKs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish feature-gated data-contribution consent, classifier lifecycle, analytics, generated SDKs, reference documentation, and audit events.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish request log, feedback, custom event, and preset evaluation-run API contracts.

- [#2313](https://github.com/phaseoteam/Phaseo/pull/2313) [`ad1c2c9`](https://github.com/phaseoteam/Phaseo/commit/ad1c2c93316321acd810d1314f09a7f4caa05a6d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Complete database-backed catalog management with registry editors and a reviewed provider pricing queue. Retire JSON imports, sync benchmarks directly to the database, and generate catalog enums from daily public database exports.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add API-key rotation, cache invalidation, complete limit metadata, generated SDK methods, documentation, and audit events.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add public enterprise directory, department, member override, membership, and directory group-mapping management APIs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish scoped management-key CRUD across the gateway, generated SDKs, reference documentation, and workspace audit log.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add enforced workspace budget management APIs and expose complete API-key limit and usage windows.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add per-model endpoint capability discovery, public model-filter aliases, and a capability-backed endpoint catalogue across the API, documentation, and generated SDKs.

- [#1721](https://github.com/phaseoteam/Phaseo/pull/1721) [`1559d64`](https://github.com/phaseoteam/Phaseo/commit/1559d6495adf3fa7e08f1ad1372e0c928ef465c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add optional user-defined app attribution while keeping SDK client identity separate from workspace apps.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add encrypted observability destination management with key and event filters.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish guardrail policy and key/member assignment management across the gateway, generated SDKs, reference documentation, and workspace audit log.

- [#1311](https://github.com/phaseoteam/Phaseo/pull/1311) [`1c19590`](https://github.com/phaseoteam/Phaseo/commit/1c1959073bd258debda77cc73590bd43e320eecc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden Batch and Video request validation, billing, managed webhooks, media fetching, bounded streaming, and asynchronous settlement. Video webhook configuration now requires a managed endpoint ID, output counts are capped and fully billed, and raw provider request overrides are rejected.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add filtered, paginated workspace analytics and spreadsheet-safe CSV export across the gateway and generated SDKs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace gateway application metadata and history-merge management APIs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish OAuth application and async webhook endpoint management with generated SDKs, reference docs, one-time secret handling, and audit events.

- [#2201](https://github.com/phaseoteam/Phaseo/pull/2201) [`0d58d7d`](https://github.com/phaseoteam/Phaseo/commit/0d58d7dc0f9a894ce1438b9487f30c4286cd2039) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace-scoped Private Models with encrypted OpenAI-compatible endpoint credentials, management APIs, model discovery, and gateway routing.

### Patch Changes

- [#2055](https://github.com/phaseoteam/Phaseo/pull/2055) [`577ec42`](https://github.com/phaseoteam/Phaseo/commit/577ec42a1a73a46e54287c878f2ed948a48a682e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Statsig-gated Alpha for the `phaseo/auto` model router with a separately metered low-cost classifier request, complexity-aware capability scoring, a managed text-model universe, workspace spend profiles and pattern restrictions, routing diagnostics, retryable model fallbacks, and a dedicated Auto Routing settings page.

- [#2156](https://github.com/phaseoteam/Phaseo/pull/2156) [`89d252a`](https://github.com/phaseoteam/Phaseo/commit/89d252ac13ed0392bcd5f6f37fb8a122ef421df1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add DeepInfra DeepSeek V4 Flash Vision Exp, Novita Ling 3.0 Flash Sante and VL, and Baseten GLM 5.3 Fast priority routing and pricing. Retire Grok Imagine Image Quality without fallback routing and complete the Grok Imagine Image 2.0 catalog metadata.

- [#1760](https://github.com/phaseoteam/Phaseo/pull/1760) [`7112de0`](https://github.com/phaseoteam/Phaseo/commit/7112de09ae6537562c746b03ccfd8409247750ac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add DeepSeek V4 Flash Vision Exp with image input support, verified pricing, and generated SDK model identifiers.

- [#2151](https://github.com/phaseoteam/Phaseo/pull/2151) [`03120b5`](https://github.com/phaseoteam/Phaseo/commit/03120b55146b8c730dbed5ea0d48fcb94ec5c2d0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Meta Muse Spark 1.3 standard and Contributor models, direct Meta routing, pricing, and generated SDK model IDs.

- [#2023](https://github.com/phaseoteam/Phaseo/pull/2023) [`c971c71`](https://github.com/phaseoteam/Phaseo/commit/c971c71aeb42e89c95b8db034c60f618466ba2f8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Tencent Hy4 Preview as a 1M-context model with GMICloud routing and pricing metadata.

- [#2021](https://github.com/phaseoteam/Phaseo/pull/2021) [`fb36be2`](https://github.com/phaseoteam/Phaseo/commit/fb36be2896eba44e6047605ef5a58bc4f2a469bf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add W&B routing for GLM 5.3 Flash and Novita's free Ling 3.0 Flash Fin model.

- [#1783](https://github.com/phaseoteam/Phaseo/pull/1783) [`91cc289`](https://github.com/phaseoteam/Phaseo/commit/91cc289328d601e50823b5c80f62a965ee35f521) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Audit Alibaba Cloud Model Studio support, add Qwen 3.6 Flash, and activate verified International hosted-model routes with current pricing.

- [#1784](https://github.com/phaseoteam/Phaseo/pull/1784) [`e48ffa3`](https://github.com/phaseoteam/Phaseo/commit/e48ffa3843dbe9416a3b9ffe2ef1b189e659cb53) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Activate the verified Amazon Bedrock Mantle text catalogue, including Nova, OpenAI GPT-5.6, and xAI Grok 4.3 routes with recorded pricing.

- [#1805](https://github.com/phaseoteam/Phaseo/pull/1805) [`0799c2a`](https://github.com/phaseoteam/Phaseo/commit/0799c2af293c8130023f3809c132ab871f8df758) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh SiliconFlow serverless model availability and pricing, and expose Gemma 4 12B through generated SDK model identifiers.

- [#1770](https://github.com/phaseoteam/Phaseo/pull/1770) [`123abbc`](https://github.com/phaseoteam/Phaseo/commit/123abbcfa38d010fedf8e6b8646e0d7ef6b0917d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile Venice model support and pricing with the live provider inventory. Refresh the documented model-helper snapshot, including current replacements and newly supported models; request model IDs continue to accept arbitrary strings.

- [#1897](https://github.com/phaseoteam/Phaseo/pull/1897) [`6230715`](https://github.com/phaseoteam/Phaseo/commit/6230715e1427c4f151a76779ec1a1ef8e4377a3b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Audit Voyage AI's embeddings, contextualized embeddings, multimodal embeddings, and reranker catalogue, routes, limits, lifecycle metadata, and pricing.

- [#1899](https://github.com/phaseoteam/Phaseo/pull/1899) [`cfd1f65`](https://github.com/phaseoteam/Phaseo/commit/cfd1f6564985abbaba3bbbfab4f52a732219fdd1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Audit Xiaomi MiMo's first-party API catalog, adding ASR, UltraSpeed, VoiceDesign, and VoiceClone with verified limits, pricing, routing, and generated SDK model identifiers.

- [#1756](https://github.com/phaseoteam/Phaseo/pull/1756) [`54a8aa1`](https://github.com/phaseoteam/Phaseo/commit/54a8aa12a0d3af2ea66c3eb8c68c1234c29ed576) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh MiniMax speech, image, music, language, web-search, and video pricing support.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record normalized request client attribution, declare official SDK identities, and show request sources in workspace usage logs.

- [#1550](https://github.com/phaseoteam/Phaseo/pull/1550) [`0d4eea3`](https://github.com/phaseoteam/Phaseo/commit/0d4eea3f0e0fea041287aade7e48af8434ff5aac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent Gemma 4 thinking from exhausting short completion budgets by defaulting hosted requests to minimal thinking, explicitly accept and document the OpenAI-compatible `reasoning_effort` alias across generated SDKs, correctly map explicit Gemma 4 reasoning controls, and add content-free diagnostics for empty provider responses.

- [#2419](https://github.com/phaseoteam/Phaseo/pull/2419) [`9707bde`](https://github.com/phaseoteam/Phaseo/commit/9707bded84ce41b65f3b9a4ada4b8fc8c56c4e95) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish working ESM and CommonJS entrypoints and remove the AI SDK provider's repository-only install hook. Coordinate language Agent SDK versions, core dependencies, attribution and Go module paths with the core SDK release. Keep Rust core and Agent SDKs on their pre-1.0 compatibility lines.

- [#1940](https://github.com/phaseoteam/Phaseo/pull/1940) [`a125b93`](https://github.com/phaseoteam/Phaseo/commit/a125b9361c9b46e95f7d1e223f11342b9f9aa832) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable DeepInfra support for IBM Granite 4.2 3B, 8B, and 30B with verified routing, capabilities, pricing, and generated SDK model identifiers.

- [#1386](https://github.com/phaseoteam/Phaseo/pull/1386) [`6844207`](https://github.com/phaseoteam/Phaseo/commit/6844207e1d784289fb85150bca0b7557fec248e6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the complete official DeepSeek V4 Flash 0731 agent benchmark set and expose the newly catalogued benchmark identifiers through the API and generated SDKs.

- [#1379](https://github.com/phaseoteam/Phaseo/pull/1379) [`cc07f80`](https://github.com/phaseoteam/Phaseo/commit/cc07f808d2bc79305ad06ba2d0a982ddb01d0379) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Model DeepSeek V4 Flash 0731 as a separate catalogue and callable model, preserve the original V4 Flash and its third-party deployments, and move only DeepSeek's current direct route and pricing to the 0731 revision.

- [#1373](https://github.com/phaseoteam/Phaseo/pull/1373) [`ae8874c`](https://github.com/phaseoteam/Phaseo/commit/ae8874cc0c9cba19c774b63aa15cb35d788dfa77) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route official DeepSeek V4 Flash requests through DeepSeek's native Responses API, keep V4 Pro on Chat Completions, refresh V4 Flash metadata and pricing verification, and retire the discontinued direct DeepSeek legacy aliases.

- [#2221](https://github.com/phaseoteam/Phaseo/pull/2221) [`4af5326`](https://github.com/phaseoteam/Phaseo/commit/4af5326382607e552373d560b63e7db6d6f6812b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Disable OVHcloud and Scaleway routes with EUR pricing, including mixed EUR/USD routes, while retaining their published pricing for reference.
  
  Refresh SDK callable-model suggestions for models whose final enabled route was disabled.

- [#1789](https://github.com/phaseoteam/Phaseo/pull/1789) [`11c0cb2`](https://github.com/phaseoteam/Phaseo/commit/11c0cb2c91ba9328cfad4b772b603b61b14a23b2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable Cohere production routes for chat, embeddings, and reranking, and catalogue its transcription API.

- [#2152](https://github.com/phaseoteam/Phaseo/pull/2152) [`7e0eba8`](https://github.com/phaseoteam/Phaseo/commit/7e0eba839009f46b1b9304eeaec3247891337587) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable Meta Muse Spark 1.2 and 1.3 Contributor routes and expose their model IDs through the generated SDKs.

- [#1781](https://github.com/phaseoteam/Phaseo/pull/1781) [`26fe64a`](https://github.com/phaseoteam/Phaseo/commit/26fe64a42371a813a618f73e21aca7eded1fb5cd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish Stealth Ox Alpha under the canonical `stealth/ox-alpha` model ID while retaining Venice as its inference provider.

- [#1640](https://github.com/phaseoteam/Phaseo/pull/1640) [`c3eadef`](https://github.com/phaseoteam/Phaseo/commit/c3eadef8fec7bf5347e92f81d351dada4c19f11c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Grok 4.6 with verified xAI API pricing and capabilities, record Qwen3.8-Max's open-weight release and new Fireworks and DigitalOcean deployments, and move DeepSeek's stable V4 Pro provider route to V4 Pro 0813.

- [#1925](https://github.com/phaseoteam/Phaseo/pull/1925) [`d6a545f`](https://github.com/phaseoteam/Phaseo/commit/d6a545fdc77ea112853ac30ae02e555b6f7f2975) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Mark the MiniMax Week x GMI Cloud free provider routes as gateway-active so GMI Cloud displays as an enabled provider on the free variant model pages.

- [#2397](https://github.com/phaseoteam/Phaseo/pull/2397) [`f534528`](https://github.com/phaseoteam/Phaseo/commit/f53452829aa3d1c85ed8e99a87ebec45a90eff00) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add independent Batch and Video webhook event subscriptions, enforce supported event names, prevent cross-job-type fallback delivery, emit distinct batch expired, status-change, and progress events, and support signed one-shot test deliveries for saved endpoints.

- [#2051](https://github.com/phaseoteam/Phaseo/pull/2051) [`7797801`](https://github.com/phaseoteam/Phaseo/commit/7797801c8ce12ba99e305aa8d44f2d66013e147a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden request validation, provider routing, local tooling, and generated client handling.

- [#2216](https://github.com/phaseoteam/Phaseo/pull/2216) [`18939f5`](https://github.com/phaseoteam/Phaseo/commit/18939f558b73f2d6e383c8614f8a5e64596ae210) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden asynchronous video settlement and terminal webhook recovery, preserve batch pricing conditions, and add scoped video provider options and explicit frame inputs. Align AtlasCloud Seedance mappings and expose LTX status and content recovery.
  
  Journal video submissions across adapters, retain holds on uncertain outcomes, validate and enable MiniMax H3 Max after native lifecycle checks, and flag unexpected zero-cost completion of paid jobs. Persist webhook attempts before releasing delivery claims and expose provider submission state in job logs.
  
  Correct MiniMax V1 resolution validation and Google REST video requests, isolate provider identity during content retrieval, recheck webhook state after claiming delivery, and preserve terminal completion timestamps on repeated reads.

- [#1497](https://github.com/phaseoteam/Phaseo/pull/1497) [`0d9465a`](https://github.com/phaseoteam/Phaseo/commit/0d9465af733b9b8e49385fce716456c05a3585cb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Disable the region-restricted Meta Muse Spark 1.2 Contributor route, document its availability limits, and normalize Fish Audio voice-design request pricing so catalog imports remain valid.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Novita routes and pricing for Ling 3.0 Tiny, Macaron V1 Tall, and Nemotron 3 Nano 30B A3B. Move Ling 3.0 Flash from its expired free route to current paid pricing, and correct Novita's DeepSeek V4 Flash 0731 route metadata.

- [#1451](https://github.com/phaseoteam/Phaseo/pull/1451) [`62a1456`](https://github.com/phaseoteam/Phaseo/commit/62a1456b5ec517fba206eff5ca865764aa0016b5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add current OpenAI diarized transcription controls and reject unsupported transcription and translation parameter combinations before sending them upstream.

- [#2295](https://github.com/phaseoteam/Phaseo/pull/2295) [`44e0ef0`](https://github.com/phaseoteam/Phaseo/commit/44e0ef0a374af5c1e32866aa52ce999553f39cfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add and enable OpenAI GPT Image 2.5 Flare and Sunburst with current capabilities and pricing, including typed multi-image edits and image streaming helpers.

- [#2269](https://github.com/phaseoteam/Phaseo/pull/2269) [`e817e48`](https://github.com/phaseoteam/Phaseo/commit/e817e48c1509890b1b50ca0f89bfc0a7b94630c2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Synchronize known model and organisation IDs with the expanded active provider catalog.

- [#2204](https://github.com/phaseoteam/Phaseo/pull/2204) [`dc62aae`](https://github.com/phaseoteam/Phaseo/commit/dc62aae435fad54fac9601fb698921aaf563bfd4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the GPT-6 Astra Pro model variant with provider metadata, pricing, generated model identifiers, and OpenAI routing that normalizes to `gpt-6-astra` with `reasoning.mode=pro`.

- [#2264](https://github.com/phaseoteam/Phaseo/pull/2264) [`6b955c0`](https://github.com/phaseoteam/Phaseo/commit/6b955c0b9aa947ff451c2076103c92d7ef7865db) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Artificial Analysis Coding, Agentic, and evaluation-cost benchmark IDs to the generated catalog enums.

- [#2165](https://github.com/phaseoteam/Phaseo/pull/2165) [`ae35df2`](https://github.com/phaseoteam/Phaseo/commit/ae35df23af2d1041bf02d6bc9dee15b2b14f7a25) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add EU and US regional provider-routing deployments, region-filtered model discovery, text-only regional request enforcement, and SDK region selection.

- [#1965](https://github.com/phaseoteam/Phaseo/pull/1965) [`8ae51cb`](https://github.com/phaseoteam/Phaseo/commit/8ae51cb5e6eb9bd8699b64ab4101980756c2b421) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the verified Alibaba Cloud Model Studio Qwen 3.8 Flash route, pricing, and public model identifier.

- [#2227](https://github.com/phaseoteam/Phaseo/pull/2227) [`feb2404`](https://github.com/phaseoteam/Phaseo/commit/feb240478dba08ee271150f8ede65d41493ff54b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix Realtime Chat authentication and session setup, preserve cached-token billing across normalization, and show database-backed session holds and final charges in Chat and Realtime Sessions logs.
  
  Correct the current OpenAI Realtime price cards and refresh generated model suggestions to remove expired MiniMax free routes. Model request fields continue to accept arbitrary string IDs; this catalogue refresh does not remove request operations or change their wire format.

- [#2242](https://github.com/phaseoteam/Phaseo/pull/2242) [`aae218a`](https://github.com/phaseoteam/Phaseo/commit/aae218a8b6ba2d7fcff1d6d119403c68e1aa37d2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh generated model IDs for the gated OpenAI Realtime and Grok Voice preview.

- [#1759](https://github.com/phaseoteam/Phaseo/pull/1759) [`e5fc123`](https://github.com/phaseoteam/Phaseo/commit/e5fc123aa1120b645e5be15ac03ad4d64e9612da) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Google Vertex and Vertex EU model lifecycles, callable routes, and current Gemini, Claude, and Veo pricing.

- [#1753](https://github.com/phaseoteam/Phaseo/pull/1753) [`0cfabaa`](https://github.com/phaseoteam/Phaseo/commit/0cfabaaab70917ea7ffb4b0b6b7dca0e58403342) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Morph model availability, multimodal support, limits, and pricing.

- [#1750](https://github.com/phaseoteam/Phaseo/pull/1750) [`749b6b6`](https://github.com/phaseoteam/Phaseo/commit/749b6b6dea4e4e8ac9e401c85799c2e934368053) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Together serverless model availability, pricing, context limits, vision capabilities, and multimodal image and audio routing.

- [#1782](https://github.com/phaseoteam/Phaseo/pull/1782) [`fe8490b`](https://github.com/phaseoteam/Phaseo/commit/fe8490b0310f3f07ba4d66222894461621c72209) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Rename the Stealth catalogue organisation from Stealth Lab to Stealth and synchronize generated model ID types.

- [#2356](https://github.com/phaseoteam/Phaseo/pull/2356) [`654f8d3`](https://github.com/phaseoteam/Phaseo/commit/654f8d31da3638efa95816269127671a572ad8a8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Treat omitted and `default` text service tiers as Standard when choosing providers, require explicit Flex for dedicated Flex offers, and label Flex pricing as opt-in on model pages.

- [#1610](https://github.com/phaseoteam/Phaseo/pull/1610) [`daf2493`](https://github.com/phaseoteam/Phaseo/commit/daf24935421185104c9b7c03fcad9f0dc44b5394) Thanks [@opencode-agent](https://github.com/apps/opencode-agent)! - Restore latency and generation metadata on successful moderation responses.

- [#1757](https://github.com/phaseoteam/Phaseo/pull/1757) [`ad787df`](https://github.com/phaseoteam/Phaseo/commit/ad787dfecddb6c8c350db2e2418a256adc7e6039) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retire AI21 gateway routes after loss of API dashboard and inference access while preserving historical models and pricing.

- [#2388](https://github.com/phaseoteam/Phaseo/pull/2388) [`b79d3ea`](https://github.com/phaseoteam/Phaseo/commit/b79d3ea6b4ecb22e69523e75b3d411590f55d6cc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retire CrofAI from active routing, discovery, and provider surfaces while preserving its identity, pricing history, request history, and logo for historical records.

- [#2301](https://github.com/phaseoteam/Phaseo/pull/2301) [`8f54673`](https://github.com/phaseoteam/Phaseo/commit/8f54673c82f93fc243f4410f1a7cb0c652be8a52) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Promote DeepSeek V4.1 Flash from its expiring Preview route to the stable model scheduled for the 10 September 2026 calendar date, retire only the old DeepSeek provider routes, route DeepSeek Pro requests through V4.1 Flash, and retain the scheduled Flash-series cache-hit, cache-miss, output, and weekday peak-hour prices.

- [#1887](https://github.com/phaseoteam/Phaseo/pull/1887) [`6da9ac8`](https://github.com/phaseoteam/Phaseo/commit/6da9ac8fcb43808dd4830c1e321b32faa3dbbc88) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile StreamLake's hosted model catalog, lifecycle, modalities, limits, throttling, service tiers, and pay-as-you-go pricing with its August 2026 documentation.

- [#1893](https://github.com/phaseoteam/Phaseo/pull/1893) [`fb585b7`](https://github.com/phaseoteam/Phaseo/commit/fb585b73a02756e2e6ae30798878f78f8c551b76) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile TensorX's complete live model catalogue and pricing, preserve delisted model history, and enable verified chat and embedding routes.

- [#1896](https://github.com/phaseoteam/Phaseo/pull/1896) [`6c5524d`](https://github.com/phaseoteam/Phaseo/commit/6c5524d9fae94d5b9f24d6928e6f10685757c983) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Upstage Embed 2 and legacy Embed aliases, complete Document Intelligence catalog coverage, and expose Upstage embeddings through the gateway.

- [#1503](https://github.com/phaseoteam/Phaseo/pull/1503) [`868c9af`](https://github.com/phaseoteam/Phaseo/commit/868c9afb54f0507fc40fd84464fdc9d396803e70) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add direct Upstage routes and pricing for Solar Pro 4, Solar Pro 3, Solar Pro 2, and Solar Mini, including Solar Pro 4's dated launch promotion. Add Solar Open 100B and Solar Open 2 250B metadata, and correct existing Solar model specifications and lineage.

- [#1547](https://github.com/phaseoteam/Phaseo/pull/1547) [`7b5e0a0`](https://github.com/phaseoteam/Phaseo/commit/7b5e0a078be7447ae01e88b7e17775a7d0e0a4ea) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Normalize video inputs and lifecycle handling across xAI, Alibaba Wan and HappyHorse, BytePlus Seedance, Fal, Runway Gen-4.5, Google AI Studio Veo, and Vertex Veo; deliver durable status-change webhooks; and temporarily disable video cancellation. HappyHorse family IDs now route text, first-frame, reference-image, and video-edit requests through the appropriate Alibaba Cloud async model with validated pricing and lifecycle recovery. Runway now uses its mode-specific task endpoints and mandatory API version, Google AI Studio Veo is routable with current pricing, and BytePlus accepts either supported gateway credential name.

- [#1935](https://github.com/phaseoteam/Phaseo/pull/1935) [`1c2c62e`](https://github.com/phaseoteam/Phaseo/commit/1c2c62e9ee48bf442f4b63f5379517b028633135) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Activate W&B Inference support for IBM Granite 4.2 8B with verified routing, pricing, and generated SDK model identifiers.

## 2.2.0

### Minor Changes

- [#1263](https://github.com/phaseoteam/Phaseo/pull/1263) [`cc87f08`](https://github.com/phaseoteam/Phaseo/commit/cc87f081dd40b898c06a957937606a2b73da6ff5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expand the Agent SDK runtime with validated tools, exact-ID approvals and manual outputs, HITL callbacks, progress events, recoverable tool errors, real cancellable gateway streams, composable stop conditions, dynamic turns, persisted next-turn overrides, application-owned state accessors, normalized usage, cost, finish reasons, and warnings. Establish equivalent conformance coverage for Python, Go, C#, Java, PHP, and Ruby, update SDK defaults to the current gateway host, and omit unset Python Agent request options instead of sending invalid null fields.

### Patch Changes

- [#1257](https://github.com/phaseoteam/Phaseo/pull/1257) [`5a02c19`](https://github.com/phaseoteam/Phaseo/commit/5a02c194d0e64642ddf23cd0d57b2b93983b148c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Represent Baseten GLM-5.2 Fast as a hidden priority service tier for GLM-5.2 instead of a separate canonical model, and refresh the generated SDK model ID snapshots.

## 2.1.1

### Patch Changes

- [#1251](https://github.com/phaseoteam/Phaseo/pull/1251) [`f1ad533`](https://github.com/phaseoteam/Phaseo/commit/f1ad5335aba3f2858156f4632d551834325c0dcd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the interactive postinstall hook so clean package installations do not fail or unexpectedly install optional tooling.

## 2.1.0

### Minor Changes

- [#567](https://github.com/phaseoteam/Phaseo/pull/567) [`b3bbccf`](https://github.com/phaseoteam/Phaseo/commit/b3bbccf8988d6d50f9412d1b91f0518e6a1bcec1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable the public Batch API and Files routes, add managed batch webhook processing, and expose TypeScript SDK helpers for polling batches, listing request rows, and verifying signed webhook deliveries.

### Patch Changes

- [#786](https://github.com/phaseoteam/Phaseo/pull/786) [`b94beae`](https://github.com/phaseoteam/Phaseo/commit/b94beae46483f5b493d6b05dfefca41dfa8b7baa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add CrofAI `greg-2-super` and `greg-2-ultra` to generated known model ID types.

- [#727](https://github.com/phaseoteam/Phaseo/pull/727) [`3b53631`](https://github.com/phaseoteam/Phaseo/commit/3b53631222ecbc5b92d712a79edab4be8949c533) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add `z-ai/glm-5.2` to generated known model ID types.

- [#948](https://github.com/phaseoteam/Phaseo/pull/948) [`c420a38`](https://github.com/phaseoteam/Phaseo/commit/c420a389be727d45daa13713658cd341081a5d3b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add GPT-5.6 Luna Pro, Sol Pro, and Terra Pro model IDs, routing them to OpenAI with `reasoning.mode=pro` while preserving separate public slugs.

- [#950](https://github.com/phaseoteam/Phaseo/pull/950) [`685ef25`](https://github.com/phaseoteam/Phaseo/commit/685ef2572a09663ffe417aed33b38e6521317801) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve GPT-5.6 Pro `max` reasoning effort, expose `reasoning.mode` in SDK request types, and send stable OpenAI safety identifiers.

- [#1186](https://github.com/phaseoteam/Phaseo/pull/1186) [`50a86ea`](https://github.com/phaseoteam/Phaseo/commit/50a86ead054c28df51fd30bb3267a0c0059205ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Poolside's Laguna S 2.1 model with its free preview gateway route, 1M-token context metadata, and release benchmarks.

- [#779](https://github.com/phaseoteam/Phaseo/pull/779) [`343999e`](https://github.com/phaseoteam/Phaseo/commit/343999eb91189dc7a402fb173196c2769816ce8c) Thanks [@opencode-agent](https://github.com/apps/opencode-agent)! - Refresh generated callable model ID constants from the current OpenAPI snapshot.

  This removes retired/non-callable constants including CrofAI `greg-1` and `greg-1-super`, older Anthropic Claude aliases, several free Gemma variants, older NVIDIA/Qwen entries, and older xAI Grok entries. It also adds newly callable constants for Anthropic Claude Fable 5, Moonshot Kimi K2.7 Code, Nex AGI Nex N2 Pro, NVIDIA Nemotron 3 Ultra 550B A55B, Stepfun Step 3.7 Flash, and Z.AI GLM 5.2.

- [#756](https://github.com/phaseoteam/Phaseo/pull/756) [`232c535`](https://github.com/phaseoteam/Phaseo/commit/232c535b651fc1d8988f0867919873646cda0093) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove retired Anthropic Claude 4 model ID constants from SDK surfaces and align provider retirement metadata across Anthropic provider catalogs.

## 2.0.5

### Patch Changes

- [#610](https://github.com/phaseoteam/Phaseo/pull/610) [`54e6640`](https://github.com/phaseoteam/Phaseo/commit/54e6640d8cd7a4062c54d47a9f8010b65273939f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Agent SDK devtools capture, expand TypeScript SDK high-level helpers for generated API operations, and extend devtools endpoint metadata for agent runs.

## 2.0.4

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (sdk/openapi changes).

  Excluded for now: @phaseo/cpp-sdk and @phaseo/rust-sdk.

## 2.0.3

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (sdk/openapi changes).

  Excluded for now: @phaseo/cpp-sdk and @phaseo/rust-sdk.

## 2.0.2

### Patch Changes

- [#396](https://github.com/phaseoteam/Phaseo/pull/396) [`0023fc3`](https://github.com/phaseoteam/Phaseo/commit/0023fc3c6d87a007189bfe1d0c8c13af8db3f21d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Separate catalog model discovery from callable SDK helper IDs.

  Request-side model identifiers are now treated as runtime strings so newly released
  models can be used without waiting for an SDK release. Generated helper constants
  are now sourced from the current callable-on-gateway snapshot instead of the full
  catalog, and SDK release automation treats model helper churn as patch-level data
  updates instead of forcing minor or major version jumps.

## 2.0.1

### Patch Changes

- [#367](https://github.com/phaseoteam/Phaseo/pull/367) [`4153c29`](https://github.com/phaseoteam/Phaseo/commit/4153c293f05414e68dcfd4e0d6b84952b2ec6fcd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Separate catalog model discovery from callable SDK helper IDs.

  Request-side model identifiers are now treated as runtime strings so newly released
  models can be used without waiting for an SDK release. Generated helper constants
  are now sourced from the current callable-on-gateway snapshot instead of the full
  catalog, and SDK release automation treats model helper churn as patch-level data
  updates instead of forcing minor or major version jumps.

## 2.0.0

### Major Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (model IDs removed (1) [qwen/qwen3-tts-tokenizer-12hz]).

  Excluded for now: @phaseo/cpp-sdk and @phaseo/rust-sdk.

## 1.2.0

### Minor Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (model IDs added (1) [x-ai/grok-4.3]).

  Excluded for now: @phaseo/cpp-sdk and @phaseo/rust-sdk.

## 1.1.3

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (sdk/openapi changes with no model-id surface changes).

  Excluded for now: @phaseo/cpp-sdk and @phaseo/rust-sdk.

## 1.1.2

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (sdk/openapi changes with no model-id surface changes).

  Excluded for now: @phaseo/cpp-sdk and @phaseo/rust-sdk.

## 1.1.1

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes.

  Excluded for now: @phaseo/cpp-sdk and @phaseo/rust-sdk.

## 1.1.0

### Minor Changes

- [#201](https://github.com/phaseoteam/Phaseo/pull/201) [`31a2268`](https://github.com/phaseoteam/Phaseo/commit/31a226829939099401558cb206890d9fede74495) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bump all functional SDKs to 1.1.0 due to model-surface changes and cross-language SDK updates.

## 1.0.2

### Patch Changes

- Regenerate SDK artifacts from the latest OpenAPI spec and publish a patch version update for the refreshed clients.

## 1.0.1

### Patch Changes

- [#47](https://github.com/phaseoteam/Phaseo/pull/47) [`3d6f643`](https://github.com/phaseoteam/Phaseo/commit/3d6f64336d20794c6f44c16a0f04cbf325ebdbdf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bundle devtools core primitives directly into the TypeScript SDK and devtools viewer so runtime installs no longer depend on `@phaseo/devtools-core`.

  Also harden publish reliability by validating `NPM_TOKEN` in CI and fixing Python `pyproject.toml` version sync.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the API and all SDKs for a coordinated breaking release.

  This captures breaking changes across endpoint surfaces, protocol/IR conversions,
  provider routing/usage behavior, and regenerated SDK interfaces from the latest
  OpenAPI definitions.

### Minor Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerate SDKs against the latest OpenAPI spec and refresh runtime helpers for the TS and Python clients.

### Patch Changes

- [#13](https://github.com/phaseoteam/Phaseo/pull/13) [`d280bf0`](https://github.com/phaseoteam/Phaseo/commit/d280bf07747eb9b07e8aff7a1dcf36038240bc11) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bump all SDKs for the next alpha drop so they land on 0.2.1-alpha.0 together.

## 0.2.1-alpha.0

### Patch Changes

- Bump all SDKs for the next alpha drop so they land on 0.2.1-alpha.0 together.

## 0.2.0

### Minor Changes

- [#8](https://github.com/phaseoteam/Phaseo/pull/8) [`144dad5`](https://github.com/phaseoteam/Phaseo/commit/144dad5cbf8f56b0e1d987b0eafb9d0be5a98d5e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerated the SDKs from the latest OpenAPI spec to reflect the updated Gateway API contract. This may include typing and surface-area changes where the API schema changed.

## 0.1.4

### Patch Changes

- [#6](https://github.com/phaseoteam/Phaseo/pull/6) [`4322886`](https://github.com/phaseoteam/Phaseo/commit/4322886327dde92030846969718c9131a2a30431) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add some older Google Models + IF Bench

## 0.1.3

### Patch Changes

- [`d322b30`](https://github.com/phaseoteam/Phaseo/commit/d322b30bbe33cde56ca80f17c5612c4609d58f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Nova 2 Models + Adjust Deepseek V3.2

## 0.1.2

### Patch Changes

- [`6210556`](https://github.com/phaseoteam/Phaseo/commit/62105560578881ccfb086074755ab1a8bf67d767) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral 3 Models

## 0.1.1

### Patch Changes

- [`b9d9fd5`](https://github.com/phaseoteam/Phaseo/commit/b9d9fd5b7a8e01aa587f119fc0abc84ea2bb01c6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update README
