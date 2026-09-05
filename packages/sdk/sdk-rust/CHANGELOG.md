# Phaseo Rust SDK

## 1.0.0

### Major Changes

- [#1770](https://github.com/phaseoteam/Phaseo/pull/1770) [`123abbc`](https://github.com/phaseoteam/Phaseo/commit/123abbcfa38d010fedf8e6b8646e0d7ef6b0917d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile Venice model support and pricing with the live provider inventory. Removed Venice route constants are a breaking SDK change; current replacements and newly supported models are included.

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.

### Minor Changes

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add complete preset lifecycle management for drafts, versions, forks, upstream updates, publisher handles, and archival.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace SSO and SCIM endpoint, token, and audit management with identity add-on enforcement, generated SDKs, docs, and audit events.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add typed workspace settings and versioned dynamic-route management APIs across the gateway, documentation, and generated SDKs.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish feature-gated data-contribution consent, classifier lifecycle, analytics, generated SDKs, reference documentation, and audit events.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add API-key rotation, cache invalidation, complete limit metadata, generated SDK methods, documentation, and audit events.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish scoped management-key CRUD across the gateway, generated SDKs, reference documentation, and workspace audit log.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add per-model endpoint capability discovery, public model-filter aliases, and a capability-backed endpoint catalogue across the API, documentation, and generated SDKs.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish guardrail policy and key/member assignment management across the gateway, generated SDKs, reference documentation, and workspace audit log.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add filtered, paginated workspace analytics and spreadsheet-safe CSV export across the gateway and generated SDKs.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish OAuth application and async webhook endpoint management with generated SDKs, reference docs, one-time secret handling, and audit events.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace-scoped Private Models with encrypted OpenAI-compatible endpoint credentials, management APIs, model discovery, and gateway routing.

### Patch Changes

- [#2055](https://github.com/phaseoteam/Phaseo/pull/2055) [`577ec42`](https://github.com/phaseoteam/Phaseo/commit/577ec42a1a73a46e54287c878f2ed948a48a682e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Statsig-gated Alpha for the `phaseo/auto` model router with a separately metered low-cost classifier request, complexity-aware capability scoring, a managed text-model universe, workspace spend profiles and pattern restrictions, routing diagnostics, retryable model fallbacks, and a dedicated Auto Routing settings page.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Cohere Parse v5.0, the `/v1/parse` document parsing endpoint, page metering, and generated SDK operations and models.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Meta Muse Spark 1.3 standard and Contributor models, direct Meta routing, pricing, and generated SDK model IDs.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Audit Alibaba Cloud Model Studio support, add Qwen 3.6 Flash, and activate verified International hosted-model routes with current pricing.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Activate the verified Amazon Bedrock Mantle text catalogue, including Nova, OpenAI GPT-5.6, and xAI Grok 4.3 routes with recorded pricing.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Identify every official SDK and Agent SDK as its canonical technical request Source without setting App attribution.

- [#1379](https://github.com/phaseoteam/Phaseo/pull/1379) [`cc07f80`](https://github.com/phaseoteam/Phaseo/commit/cc07f808d2bc79305ad06ba2d0a982ddb01d0379) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Model DeepSeek V4 Flash 0731 as a separate catalogue and callable model, preserve the original V4 Flash and its third-party deployments, and move only DeepSeek's current direct route and pricing to the 0731 revision.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable Cohere production routes for chat, embeddings, and reranking, and catalogue its transcription API.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable Meta Muse Spark 1.2 and 1.3 Contributor routes and expose their model IDs through the generated SDKs.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Grok 4.6 with verified xAI API pricing and capabilities, record Qwen3.8-Max's open-weight release and new Fireworks and DigitalOcean deployments, and move DeepSeek's stable V4 Pro provider route to V4 Pro 0813.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Disable the region-restricted Meta Muse Spark 1.2 Contributor route, document its availability limits, and normalize Fish Audio voice-design request pricing so catalog imports remain valid.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Novita routes and pricing for Ling 3.0 Tiny, Macaron V1 Tall, and Nemotron 3 Nano 30B A3B. Move Ling 3.0 Flash from its expired free route to current paid pricing, and correct Novita's DeepSeek V4 Flash 0731 route metadata.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore latency and generation metadata on successful moderation responses.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add direct Upstage routes and pricing for Solar Pro 4, Solar Pro 3, Solar Pro 2, and Solar Mini, including Solar Pro 4's dated launch promotion. Add Solar Open 100B and Solar Open 2 250B metadata, and correct existing Solar model specifications and lineage.

- [#1547](https://github.com/phaseoteam/Phaseo/pull/1547) [`7b5e0a0`](https://github.com/phaseoteam/Phaseo/commit/7b5e0a078be7447ae01e88b7e17775a7d0e0a4ea) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Normalize video inputs and lifecycle handling across xAI, Alibaba Wan and HappyHorse, BytePlus Seedance, Fal, Runway Gen-4.5, Google AI Studio Veo, and Vertex Veo; deliver durable status-change webhooks; and temporarily disable video cancellation. HappyHorse family IDs now route text, first-frame, reference-image, and video-edit requests through the appropriate Alibaba Cloud async model with validated pricing and lifecycle recovery. Runway now uses its mode-specific task endpoints and mandatory API version, Google AI Studio Veo is routable with current pricing, and BytePlus accepts either supported gateway credential name.

## 0.1.0

- Publish the first supported `phaseo` crate on crates.io.
- Add an authenticated, secret-redacting Phaseo Gateway client with Responses and Chat Completions helpers.
- Preserve generated endpoint coverage under `phaseo::gen` and add CI, packaging, and live-smoke guards.

## 1.0.2

### Patch Changes

- [#786](https://github.com/phaseoteam/Phaseo/pull/786) [`b94beae`](https://github.com/phaseoteam/Phaseo/commit/b94beae46483f5b493d6b05dfefca41dfa8b7baa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add CrofAI `greg-2-super` and `greg-2-ultra` to generated known model ID types.

- [#950](https://github.com/phaseoteam/Phaseo/pull/950) [`685ef25`](https://github.com/phaseoteam/Phaseo/commit/685ef2572a09663ffe417aed33b38e6521317801) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve GPT-5.6 Pro `max` reasoning effort, expose `reasoning.mode` in SDK request types, and send stable OpenAI safety identifiers.

- [#1186](https://github.com/phaseoteam/Phaseo/pull/1186) [`50a86ea`](https://github.com/phaseoteam/Phaseo/commit/50a86ead054c28df51fd30bb3267a0c0059205ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Poolside's Laguna S 2.1 model with its free preview gateway route, 1M-token context metadata, and release benchmarks.

- [#779](https://github.com/phaseoteam/Phaseo/pull/779) [`343999e`](https://github.com/phaseoteam/Phaseo/commit/343999eb91189dc7a402fb173196c2769816ce8c) Thanks [@opencode-agent](https://github.com/apps/opencode-agent)! - Refresh generated callable model ID constants from the current OpenAPI snapshot.

  This removes retired/non-callable constants including CrofAI `greg-1` and `greg-1-super`, older Anthropic Claude aliases, several free Gemma variants, older NVIDIA/Qwen entries, and older xAI Grok entries. It also adds newly callable constants for Anthropic Claude Fable 5, Moonshot Kimi K2.7 Code, Nex AGI Nex N2 Pro, NVIDIA Nemotron 3 Ultra 550B A55B, Stepfun Step 3.7 Flash, and Z.AI GLM 5.2.

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
