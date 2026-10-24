# @phaseo/java-sdk

## 3.1.0

### Minor Changes

- [#2425](https://github.com/phaseoteam/Phaseo/pull/2425) [`9b68ad3`](https://github.com/phaseoteam/Phaseo/commit/9b68ad32bbad415bd591c01d2d46841fe43119d3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add TypeSafe Jev structured Decisions support through the `/v1/decisions` gateway endpoint, generated SDK operations, catalog pricing, and a dedicated Decisions playground.

- [#3164](https://github.com/phaseoteam/Phaseo/pull/3164) [`bd24fb5`](https://github.com/phaseoteam/Phaseo/commit/bd24fb571ae1e69fd1f84a03454045049d9bf4e5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - API keys accept and return `storage_locations`: where you keep the key (for example `railway`, `vercel`, `github`, `1password`), up to 8 ids. Set it when creating or updating a key, clear it with `null` or `[]`; a rotated key keeps it. Revoked keys now answer `409 key_revoked` when asked to turn back on.

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

- [#2838](https://github.com/phaseoteam/Phaseo/pull/2838) [`fc3ad0e`](https://github.com/phaseoteam/Phaseo/commit/fc3ad0e3cb95e5d677e87f469a7ef5d736bc853b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add `GET /v1/models?format=openai` for OpenAI-compatible model discovery. Native JSON remains the default; OpenAI format returns all filtered models unless an explicit limit is supplied.
  
  Generated TypeScript and Python model-list responses now include both native and OpenAI shapes. Typed consumers must narrow the response before accessing format-specific fields.

- [#2744](https://github.com/phaseoteam/Phaseo/pull/2744) [`5cc4d2f`](https://github.com/phaseoteam/Phaseo/commit/5cc4d2faa1440b62f07a6c5774f44adc1a066d62) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make OpenAI-compatible input and ordered question/answer arrays the preferred Decisions contract across the gateway, SDKs, docs, and playground. Support GPT-6 Luna with inline images, typed boolean choices, refusal handling, and input-only billing while preserving legacy state/question-map callers and SDK type names.

- [#2888](https://github.com/phaseoteam/Phaseo/pull/2888) [`dafbc58`](https://github.com/phaseoteam/Phaseo/commit/dafbc580dcda55d340613949c80939763f07215d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for named rate limit policies (requests per minute, tokens per minute, concurrent requests) and their assignments to API keys, members, departments, guardrails, or the workspace's end-user default, with new `rate_limits:read`, `rate_limits:write`, and `rate_limits:delete` scopes. The gateway does not enforce these policies yet. API keys can now be linked to a department with `department_id`. The guardrail request and spend limit fields, which were never enforced, are marked deprecated.

- [#3029](https://github.com/phaseoteam/Phaseo/pull/3029) [`c8f3bca`](https://github.com/phaseoteam/Phaseo/commit/c8f3bcaebc6c6c6f37c5f32bef03852b3e5724f1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for request classifiers (`/v1/classifiers`), with new `classifiers:read`, `classifiers:write`, and `classifiers:delete` scopes. A classifier is a workspace taxonomy of up to 12 dimensions, a model, optional instructions, a sample rate, an optional scope (keys, apps, models), and an optional monthly budget; up to 5 per workspace. The gateway does not run classifiers yet.

- [#2858](https://github.com/phaseoteam/Phaseo/pull/2858) [`6f98576`](https://github.com/phaseoteam/Phaseo/commit/6f985766f09ad3c626a3a3fdbcb65b265663c181) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Honour the request-level `models` fallback list on every inference endpoint. `model` stays required and is the primary model; the optional `models` array lists up to 25 fallbacks tried in order when an attempt fails with `429`, `500`, `502`, `503`, or `504`. Each fallback reruns the full pipeline, and logs, usage, billing and the response `model` reflect the model that served the request. Streams fall back only before the first byte, and video and music jobs only at submission. Realtime sessions, batches and council runs reject `models` with a `400` instead of ignoring it.

- [#3052](https://github.com/phaseoteam/Phaseo/pull/3052) [`11b4cfd`](https://github.com/phaseoteam/Phaseo/commit/11b4cfdd8230bcee8b06fb158b0480b33073ecb4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add `reasoning` to `ChatMessage`, alongside `reasoning_content`, and `signature` and `format` to `ResponsesInputItem`, so reasoning items can carry a provider signature. Add the `ResponsesReasoningTextPart` model (`type: "reasoning_text"`) as a new member of the `ResponsesOutputContentPart` union.
  
  No SDK field or type is renamed or removed, but the API now returns reasoning text in Responses `reasoning` items as `reasoning_text` parts instead of `output_text` parts. Code that picks reasoning text by checking for an `output_text` part, or that handles every `ResponsesOutputContentPart` as `output_text`, should also handle `ResponsesReasoningTextPart`; the text is still in `text`.

- [#2455](https://github.com/phaseoteam/Phaseo/pull/2455) [`a94e315`](https://github.com/phaseoteam/Phaseo/commit/a94e31546ec77fbcbdc708f622d2c581afec2a4d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a shared SDK transport contract with request-scoped controls, safe read retries, idempotency keys, raw response metadata, structured HTTP errors, and public request lifecycle hooks.

### Patch Changes

- [#2994](https://github.com/phaseoteam/Phaseo/pull/2994) [`030dbd0`](https://github.com/phaseoteam/Phaseo/commit/030dbd0195997330085f8a9164f233b770d5bde7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Chat `file` content part (`FileContentPart`, which needs `file_data` or `file_id`) and the `/v1/messages` `service_tier` values `auto` and `standard_only`. Chat message `content` is documented as nullable: only assistant messages that call tools may send `null`, and the TypeScript and Python types now allow it. Message and content types are otherwise unchanged in every SDK, so this is not a breaking change.

- [#2711](https://github.com/phaseoteam/Phaseo/pull/2711) [`2a84658`](https://github.com/phaseoteam/Phaseo/commit/2a84658993c7477296c1ac4461d59044d3c732dc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update vulnerable runtime and tooling dependencies to patched releases, including Hono, Electron, Jackson, Guzzle, and shared dependency overrides.

- [#2646](https://github.com/phaseoteam/Phaseo/pull/2646) [`4de0d4c`](https://github.com/phaseoteam/Phaseo/commit/4de0d4c85c77c2f0e2416da12ab8ba56bd8643d3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Eleven v4 and Eleven v4 Turbo speech routes with support for ElevenLabs voice library IDs and model-specific setting validation. Expose speech configuration and v4 model IDs through the OpenAPI contract and generated SDKs.

- [#2904](https://github.com/phaseoteam/Phaseo/pull/2904) [`6388cf2`](https://github.com/phaseoteam/Phaseo/commit/6388cf2d0007240446fc5df8f705feeb2537d7c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add verified Java source-install guides, corrected JSON examples, streaming instructions, and language selection across the documentation and model quickstarts. Cover Java streaming and local HTTP behavior with deterministic tests, and add CMake build and test support for the C++ preview. Keep C++ out of the published SDK menu until its HTTP transport and streaming support are ready.
  
  Use tested Java HTTP multipart examples for file uploads, audio transcription and translation, and image edits until the SDK supports multipart encoding. Verify the documented requests against a local multipart parser in CI.

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

- [#2946](https://github.com/phaseoteam/Phaseo/pull/2946) [`105d6d2`](https://github.com/phaseoteam/Phaseo/commit/105d6d28d5947798db8f6013034cfd0f300047ff) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `rate_limit_throttled` notification event. Workspaces that route it to a destination get at most one alert an hour when rate limit policies reject requests, with the total over the last 15 minutes and the most-rejected policies.

- [#2429](https://github.com/phaseoteam/Phaseo/pull/2429) [`2b78b13`](https://github.com/phaseoteam/Phaseo/commit/2b78b13e7225b6ccb54c9c4a615b73455cdb26b6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refine the Decisions chat experience with typed question controls, local conversation history, structured result rendering, canonical Jev model identity, and complete request timing metadata. Expose provider-neutral Decisions naming across the gateway, web proxy, OpenAPI contract, and generated SDKs while keeping TypeSafe's System One terminology inside its provider adapter. Keep text generation internally streamed while preserving non-streaming client responses.

- [#3049](https://github.com/phaseoteam/Phaseo/pull/3049) [`66fcd1e`](https://github.com/phaseoteam/Phaseo/commit/66fcd1e73a3f342f680d7d2228fc038be05b9e35) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the newly documented text request and response fields to the generated models: `include_reasoning` and `prediction` on `ChatCompletionsRequest`, `context_management` and `user` on `AnthropicMessagesRequest`, and `context_management` (with `applied_edits`) on `AnthropicMessagesResponse`. `service_tier` on Chat and Responses requests now also accepts `auto`, `scale` and `null`, and `reasoning.effort` accepts `null`. No existing field is renamed or removed. In the Rust and C++ models, `service_tier` and `effort` are now nullable optionals, the same mapping those SDKs already use for other nullable fields such as `prompt_cache_key`.

- [#3055](https://github.com/phaseoteam/Phaseo/pull/3055) [`d6c8e94`](https://github.com/phaseoteam/Phaseo/commit/d6c8e94e149c3065fec766ab1043bd970e88ee28) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `ErrorObject` model (`code`, `message`, `type`, `param`, `metadata`) and the top-level `code` field to `ErrorResponse`, matching the gateway's error body. `ErrorResponse.error` still accepts the older code string, and no existing field is renamed or removed. In every SDK except Rust, no existing type changes either.
  
  In the Rust SDK, `ErrorResponse.error` changes from `String` to `serde_json::Value`, because a `String` cannot hold the error object; it holds either shape. Code that read `error` as a `String` should use `error.as_str()` for the old code string or `error["code"]` for the object. `PhaseoError::code` now also reads the old code string when a response has no `error.code` or top-level `code`.

- [#3050](https://github.com/phaseoteam/Phaseo/pull/3050) [`838bebb`](https://github.com/phaseoteam/Phaseo/commit/838bebbd2779648f6d17f16de81d3ea5dbf8db36) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the optional `cost` (US dollars) and `cost_details` fields to `Usage` and `AnthropicUsage`, and the new `UsageCostDetails` model with `upstream_inference_cost`, so typed clients can read the request cost the gateway now reports on Chat Completions, Responses, Messages and embeddings responses.
  
  `ApiKeyWithValueResponse` gains `key`, the new key's secret at the top level, the same value as `data.key`. The gateway always returns it from `POST /v1/keys`. Nothing is renamed or removed. In the Rust SDK, code that builds an `ApiKeyWithValueResponse` with a struct literal now needs to set `key` too.

- [#3051](https://github.com/phaseoteam/Phaseo/pull/3051) [`fe15146`](https://github.com/phaseoteam/Phaseo/commit/fe151469bf445622adbacba1267c196a89d58650) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `plugins` field to Chat Completions, Responses and Messages requests, with the `WebSearchPlugin` (`web`), `WebFetchPlugin` (`web-fetch`) and `ResponseHealingPlugin` (`response-healing`) models, and add `OpenAIWebSearchToolDefinition` to the accepted tool types. These are additions only; no existing type or field is renamed or removed.

- [#2773](https://github.com/phaseoteam/Phaseo/pull/2773) [`f0c2012`](https://github.com/phaseoteam/Phaseo/commit/f0c201294b5b5feffc9da8d45d6059bf0761f18d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Strengthen request policy enforcement, privacy controls, resource limits, and SDK path handling. Require a workspace privacy review before Chat resumes.

## 3.0.0

### Major Changes

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.

### Minor Changes

- [#2009](https://github.com/phaseoteam/Phaseo/pull/2009) [`0f16f22`](https://github.com/phaseoteam/Phaseo/commit/0f16f225ee2b00a0f2c367067c623650dcb5708d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Cohere Parse v5.0, the `/v1/parse` document parsing endpoint, page metering, and generated SDK operations and models.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add complete preset lifecycle management for drafts, versions, forks, upstream updates, publisher handles, and archival.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace SSO and SCIM endpoint, token, and audit management with identity add-on enforcement, generated SDKs, docs, and audit events.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add typed workspace settings and versioned dynamic-route management APIs across the gateway, documentation, and generated SDKs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish feature-gated data-contribution consent, classifier lifecycle, analytics, generated SDKs, reference documentation, and audit events.

- [#2313](https://github.com/phaseoteam/Phaseo/pull/2313) [`ad1c2c9`](https://github.com/phaseoteam/Phaseo/commit/ad1c2c93316321acd810d1314f09a7f4caa05a6d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Complete database-backed catalog management with registry editors and a reviewed provider pricing queue. Retire JSON imports, sync benchmarks directly to the database, and generate catalog enums from daily public database exports.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add API-key rotation, cache invalidation, complete limit metadata, generated SDK methods, documentation, and audit events.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish scoped management-key CRUD across the gateway, generated SDKs, reference documentation, and workspace audit log.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add per-model endpoint capability discovery, public model-filter aliases, and a capability-backed endpoint catalogue across the API, documentation, and generated SDKs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish guardrail policy and key/member assignment management across the gateway, generated SDKs, reference documentation, and workspace audit log.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add filtered, paginated workspace analytics and spreadsheet-safe CSV export across the gateway and generated SDKs.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish OAuth application and async webhook endpoint management with generated SDKs, reference docs, one-time secret handling, and audit events.

- [#2201](https://github.com/phaseoteam/Phaseo/pull/2201) [`0d58d7d`](https://github.com/phaseoteam/Phaseo/commit/0d58d7dc0f9a894ce1438b9487f30c4286cd2039) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace-scoped Private Models with encrypted OpenAI-compatible endpoint credentials, management APIs, model discovery, and gateway routing.

### Patch Changes

- [#2055](https://github.com/phaseoteam/Phaseo/pull/2055) [`577ec42`](https://github.com/phaseoteam/Phaseo/commit/577ec42a1a73a46e54287c878f2ed948a48a682e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Statsig-gated Alpha for the `phaseo/auto` model router with a separately metered low-cost classifier request, complexity-aware capability scoring, a managed text-model universe, workspace spend profiles and pattern restrictions, routing diagnostics, retryable model fallbacks, and a dedicated Auto Routing settings page.

- [#2151](https://github.com/phaseoteam/Phaseo/pull/2151) [`03120b5`](https://github.com/phaseoteam/Phaseo/commit/03120b55146b8c730dbed5ea0d48fcb94ec5c2d0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Meta Muse Spark 1.3 standard and Contributor models, direct Meta routing, pricing, and generated SDK model IDs.

- [#1783](https://github.com/phaseoteam/Phaseo/pull/1783) [`91cc289`](https://github.com/phaseoteam/Phaseo/commit/91cc289328d601e50823b5c80f62a965ee35f521) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Audit Alibaba Cloud Model Studio support, add Qwen 3.6 Flash, and activate verified International hosted-model routes with current pricing.

- [#1784](https://github.com/phaseoteam/Phaseo/pull/1784) [`e48ffa3`](https://github.com/phaseoteam/Phaseo/commit/e48ffa3843dbe9416a3b9ffe2ef1b189e659cb53) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Activate the verified Amazon Bedrock Mantle text catalogue, including Nova, OpenAI GPT-5.6, and xAI Grok 4.3 routes with recorded pricing.

- [#1770](https://github.com/phaseoteam/Phaseo/pull/1770) [`123abbc`](https://github.com/phaseoteam/Phaseo/commit/123abbcfa38d010fedf8e6b8646e0d7ef6b0917d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile Venice model support and pricing with the live provider inventory. Refresh the documented model-helper snapshot, including current replacements and newly supported models; request model IDs continue to accept arbitrary strings.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Identify every official SDK and Agent SDK as its canonical technical request Source without setting App attribution.

- [#1550](https://github.com/phaseoteam/Phaseo/pull/1550) [`0d4eea3`](https://github.com/phaseoteam/Phaseo/commit/0d4eea3f0e0fea041287aade7e48af8434ff5aac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent Gemma 4 thinking from exhausting short completion budgets by defaulting hosted requests to minimal thinking, explicitly accept and document the OpenAI-compatible `reasoning_effort` alias across generated SDKs, correctly map explicit Gemma 4 reasoning controls, and add content-free diagnostics for empty provider responses.

- [#1379](https://github.com/phaseoteam/Phaseo/pull/1379) [`cc07f80`](https://github.com/phaseoteam/Phaseo/commit/cc07f808d2bc79305ad06ba2d0a982ddb01d0379) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Model DeepSeek V4 Flash 0731 as a separate catalogue and callable model, preserve the original V4 Flash and its third-party deployments, and move only DeepSeek's current direct route and pricing to the 0731 revision.

- [#1373](https://github.com/phaseoteam/Phaseo/pull/1373) [`ae8874c`](https://github.com/phaseoteam/Phaseo/commit/ae8874cc0c9cba19c774b63aa15cb35d788dfa77) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route official DeepSeek V4 Flash requests through DeepSeek's native Responses API, keep V4 Pro on Chat Completions, refresh V4 Flash metadata and pricing verification, and retire the discontinued direct DeepSeek legacy aliases.

- [#1789](https://github.com/phaseoteam/Phaseo/pull/1789) [`11c0cb2`](https://github.com/phaseoteam/Phaseo/commit/11c0cb2c91ba9328cfad4b772b603b61b14a23b2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable Cohere production routes for chat, embeddings, and reranking, and catalogue its transcription API.

- [#2152](https://github.com/phaseoteam/Phaseo/pull/2152) [`7e0eba8`](https://github.com/phaseoteam/Phaseo/commit/7e0eba839009f46b1b9304eeaec3247891337587) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable Meta Muse Spark 1.2 and 1.3 Contributor routes and expose their model IDs through the generated SDKs.

- [#1781](https://github.com/phaseoteam/Phaseo/pull/1781) [`26fe64a`](https://github.com/phaseoteam/Phaseo/commit/26fe64a42371a813a618f73e21aca7eded1fb5cd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish Stealth Ox Alpha under the canonical `stealth/ox-alpha` model ID while retaining Venice as its inference provider.

- [#1640](https://github.com/phaseoteam/Phaseo/pull/1640) [`c3eadef`](https://github.com/phaseoteam/Phaseo/commit/c3eadef8fec7bf5347e92f81d351dada4c19f11c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Grok 4.6 with verified xAI API pricing and capabilities, record Qwen3.8-Max's open-weight release and new Fireworks and DigitalOcean deployments, and move DeepSeek's stable V4 Pro provider route to V4 Pro 0813.

- [#2397](https://github.com/phaseoteam/Phaseo/pull/2397) [`f534528`](https://github.com/phaseoteam/Phaseo/commit/f53452829aa3d1c85ed8e99a87ebec45a90eff00) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add independent Batch and Video webhook event subscriptions, enforce supported event names, prevent cross-job-type fallback delivery, emit distinct batch expired, status-change, and progress events, and support signed one-shot test deliveries for saved endpoints.

- [#1497](https://github.com/phaseoteam/Phaseo/pull/1497) [`0d9465a`](https://github.com/phaseoteam/Phaseo/commit/0d9465af733b9b8e49385fce716456c05a3585cb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Disable the region-restricted Meta Muse Spark 1.2 Contributor route, document its availability limits, and normalize Fish Audio voice-design request pricing so catalog imports remain valid.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Novita routes and pricing for Ling 3.0 Tiny, Macaron V1 Tall, and Nemotron 3 Nano 30B A3B. Move Ling 3.0 Flash from its expired free route to current paid pricing, and correct Novita's DeepSeek V4 Flash 0731 route metadata.

- [#2295](https://github.com/phaseoteam/Phaseo/pull/2295) [`44e0ef0`](https://github.com/phaseoteam/Phaseo/commit/44e0ef0a374af5c1e32866aa52ce999553f39cfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add and enable OpenAI GPT Image 2.5 Flare and Sunburst with current capabilities and pricing, including typed multi-image edits and image streaming helpers.

- [#2269](https://github.com/phaseoteam/Phaseo/pull/2269) [`e817e48`](https://github.com/phaseoteam/Phaseo/commit/e817e48c1509890b1b50ca0f89bfc0a7b94630c2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Synchronize known model and organisation IDs with the expanded active provider catalog.

- [#1610](https://github.com/phaseoteam/Phaseo/pull/1610) [`daf2493`](https://github.com/phaseoteam/Phaseo/commit/daf24935421185104c9b7c03fcad9f0dc44b5394) Thanks [@opencode-agent](https://github.com/apps/opencode-agent)! - Restore latency and generation metadata on successful moderation responses.

- [#2388](https://github.com/phaseoteam/Phaseo/pull/2388) [`b79d3ea`](https://github.com/phaseoteam/Phaseo/commit/b79d3ea6b4ecb22e69523e75b3d411590f55d6cc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retire CrofAI from active routing, discovery, and provider surfaces while preserving its identity, pricing history, request history, and logo for historical records.

- [#2301](https://github.com/phaseoteam/Phaseo/pull/2301) [`8f54673`](https://github.com/phaseoteam/Phaseo/commit/8f54673c82f93fc243f4410f1a7cb0c652be8a52) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Promote DeepSeek V4.1 Flash from its expiring Preview route to the stable model scheduled for the 10 September 2026 calendar date, retire only the old DeepSeek provider routes, route DeepSeek Pro requests through V4.1 Flash, and retain the scheduled Flash-series cache-hit, cache-miss, output, and weekday peak-hour prices.

- [#1503](https://github.com/phaseoteam/Phaseo/pull/1503) [`868c9af`](https://github.com/phaseoteam/Phaseo/commit/868c9afb54f0507fc40fd84464fdc9d396803e70) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add direct Upstage routes and pricing for Solar Pro 4, Solar Pro 3, Solar Pro 2, and Solar Mini, including Solar Pro 4's dated launch promotion. Add Solar Open 100B and Solar Open 2 250B metadata, and correct existing Solar model specifications and lineage.

- [#1547](https://github.com/phaseoteam/Phaseo/pull/1547) [`7b5e0a0`](https://github.com/phaseoteam/Phaseo/commit/7b5e0a078be7447ae01e88b7e17775a7d0e0a4ea) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Normalize video inputs and lifecycle handling across xAI, Alibaba Wan and HappyHorse, BytePlus Seedance, Fal, Runway Gen-4.5, Google AI Studio Veo, and Vertex Veo; deliver durable status-change webhooks; and temporarily disable video cancellation. HappyHorse family IDs now route text, first-frame, reference-image, and video-edit requests through the appropriate Alibaba Cloud async model with validated pricing and lifecycle recovery. Runway now uses its mode-specific task endpoints and mandatory API version, Google AI Studio Veo is routable with current pricing, and BytePlus accepts either supported gateway credential name.

## 2.0.5

### Patch Changes

- [#786](https://github.com/phaseoteam/Phaseo/pull/786) [`b94beae`](https://github.com/phaseoteam/Phaseo/commit/b94beae46483f5b493d6b05dfefca41dfa8b7baa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add CrofAI `greg-2-super` and `greg-2-ultra` to generated known model ID types.

- [#950](https://github.com/phaseoteam/Phaseo/pull/950) [`685ef25`](https://github.com/phaseoteam/Phaseo/commit/685ef2572a09663ffe417aed33b38e6521317801) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve GPT-5.6 Pro `max` reasoning effort, expose `reasoning.mode` in SDK request types, and send stable OpenAI safety identifiers.

- [#779](https://github.com/phaseoteam/Phaseo/pull/779) [`343999e`](https://github.com/phaseoteam/Phaseo/commit/343999eb91189dc7a402fb173196c2769816ce8c) Thanks [@opencode-agent](https://github.com/apps/opencode-agent)! - Refresh generated callable model ID constants from the current OpenAPI snapshot.

  This removes retired/non-callable constants including CrofAI `greg-1` and `greg-1-super`, older Anthropic Claude aliases, several free Gemma variants, older NVIDIA/Qwen entries, and older xAI Grok entries. It also adds newly callable constants for Anthropic Claude Fable 5, Moonshot Kimi K2.7 Code, Nex AGI Nex N2 Pro, NVIDIA Nemotron 3 Ultra 550B A55B, Stepfun Step 3.7 Flash, and Z.AI GLM 5.2.

- [#1042](https://github.com/phaseoteam/Phaseo/pull/1042) [`9e3749b`](https://github.com/phaseoteam/Phaseo/commit/9e3749bfdd06b2d10278787f7c0cfa67cfa4a56a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden OAuth and gateway-adjacent data access, webhook SSRF validation, error serialization, local credential handling, dependency security, and database RPC permissions following a repository-wide security audit.

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

## 1.0.1

### Patch Changes

- Add Java, C++, and Rust SDKs to the OpenAPI generation pipeline and refresh their generated client artifacts.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the API and all SDKs for a coordinated breaking release.

  This captures breaking changes across endpoint surfaces, protocol/IR conversions,
  provider routing/usage behavior, and regenerated SDK interfaces from the latest
  OpenAPI definitions.

### Minor Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerate language SDKs against the latest OpenAPI spec.
