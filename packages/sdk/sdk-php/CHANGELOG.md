# @phaseo/php-sdk

## 3.1.0

### Minor Changes

- [#2425](https://github.com/phaseoteam/Phaseo/pull/2425) [`9b68ad3`](https://github.com/phaseoteam/Phaseo/commit/9b68ad32bbad415bd591c01d2d46841fe43119d3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add TypeSafe Jev structured Decisions support through the `/v1/decisions` gateway endpoint, generated SDK operations, catalog pricing, and a dedicated Decisions playground.

### Patch Changes

- [#2429](https://github.com/phaseoteam/Phaseo/pull/2429) [`2b78b13`](https://github.com/phaseoteam/Phaseo/commit/2b78b13e7225b6ccb54c9c4a615b73455cdb26b6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refine the Decisions chat experience with typed question controls, local conversation history, structured result rendering, canonical Jev model identity, and complete request timing metadata. Expose provider-neutral Decisions naming across the gateway, web proxy, OpenAPI contract, and generated SDKs while keeping TypeSafe's System One terminology inside its provider adapter. Keep text generation internally streamed while preserving non-streaming client responses.

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

- [#2051](https://github.com/phaseoteam/Phaseo/pull/2051) [`7797801`](https://github.com/phaseoteam/Phaseo/commit/7797801c8ce12ba99e305aa8d44f2d66013e147a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden request validation, provider routing, local tooling, and generated client handling.

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

- Regenerate SDK artifacts from the latest OpenAPI spec and publish a patch version update for the refreshed clients.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the API and all SDKs for a coordinated breaking release.

  This captures breaking changes across endpoint surfaces, protocol/IR conversions,
  provider routing/usage behavior, and regenerated SDK interfaces from the latest
  OpenAPI definitions.

### Minor Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerate language SDKs against the latest OpenAPI spec.

### Patch Changes

- [#13](https://github.com/phaseoteam/Phaseo/pull/13) [`d280bf0`](https://github.com/phaseoteam/Phaseo/commit/d280bf07747eb9b07e8aff7a1dcf36038240bc11) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bump all SDKs for the next alpha drop so they land on 0.2.1-alpha.0 together.

## 0.2.1-alpha.0

### Patch Changes

- Bump all SDKs for the next alpha drop so they land on 0.2.1-alpha.0 together.

## 0.1.0

### Minor Changes

- [#8](https://github.com/phaseoteam/Phaseo/pull/8) [`144dad5`](https://github.com/phaseoteam/Phaseo/commit/144dad5cbf8f56b0e1d987b0eafb9d0be5a98d5e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerated the SDKs from the latest OpenAPI spec to reflect the updated Gateway API contract. This may include typing and surface-area changes where the API schema changed.

## 0.0.1

### Patch Changes

- [`d322b30`](https://github.com/phaseoteam/Phaseo/commit/d322b30bbe33cde56ca80f17c5612c4609d58f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Nova 2 Models + Adjust Deepseek V3.2
