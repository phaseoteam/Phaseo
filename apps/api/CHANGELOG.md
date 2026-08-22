# @phaseo/gateway-api

## 2.0.0

### Major Changes

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.

### Minor Changes

- [#1314](https://github.com/phaseoteam/Phaseo/pull/1314) [`7a37f89`](https://github.com/phaseoteam/Phaseo/commit/7a37f8956c26affcaa792ecfbac445bf0c90f218) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add key-scoped dynamic routing flows, searchable model selection with ordered model and provider fallbacks, provider-health suggestions, and 15-minute cache-aware plus session-aware provider affinity.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add per-model endpoint capability discovery, public model-filter aliases, and a capability-backed endpoint catalogue across the API, documentation, and generated SDKs.

- [#1369](https://github.com/phaseoteam/Phaseo/pull/1369) [`3fa9feb`](https://github.com/phaseoteam/Phaseo/commit/3fa9febba8782b0f37baf7d913ad52051273507f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider-qualified model identifiers for exact provider-model routing while preserving canonical model suffixes and existing workspace routing safeguards.

- [#1666](https://github.com/phaseoteam/Phaseo/pull/1666) [`b690c19`](https://github.com/phaseoteam/Phaseo/commit/b690c195943491b9706ac445140f686f1f75b557) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Overhaul provider protocol, capability, media, batch, usage, and catalog contracts against current first-party API documentation.

- [#1311](https://github.com/phaseoteam/Phaseo/pull/1311) [`1c19590`](https://github.com/phaseoteam/Phaseo/commit/1c1959073bd258debda77cc73590bd43e320eecc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden Batch and Video request validation, billing, managed webhooks, media fetching, bounded streaming, and asynchronous settlement. Video webhook configuration now requires a managed endpoint ID, output counts are capped and fully billed, and raw provider request overrides are rejected.

- [#1447](https://github.com/phaseoteam/Phaseo/pull/1447) [`2280801`](https://github.com/phaseoteam/Phaseo/commit/2280801bd70f0ade92f30c728a61fc04b0f0808c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add first-class Subagent, Fusion, and model-catalogue search server tools, strengthen server-tool limits and usage reporting, and standardize Phaseo tool naming.

### Patch Changes

- [#1760](https://github.com/phaseoteam/Phaseo/pull/1760) [`7112de0`](https://github.com/phaseoteam/Phaseo/commit/7112de09ae6537562c746b03ccfd8409247750ac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add DeepSeek V4 Flash Vision Exp with image input support, verified pricing, and generated SDK model identifiers.

- [#1315](https://github.com/phaseoteam/Phaseo/pull/1315) [`57c16c3`](https://github.com/phaseoteam/Phaseo/commit/57c16c37abb38be1d7cdb821775e8b0f056bc1dd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Move Amazon Bedrock text inference onto Mantle Responses, Chat Completions, and Anthropic Messages, and correct catalog reference validation so supported legacy identities and API-model aliases resolve without warnings.

- [#1652](https://github.com/phaseoteam/Phaseo/pull/1652) [`c13a9f9`](https://github.com/phaseoteam/Phaseo/commit/c13a9f93516fb718e48acdc2605b9402212599ca) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forward documented reasoning efforts for the latest DeepSeek V4 Flash model.

- [#1480](https://github.com/phaseoteam/Phaseo/pull/1480) [`6ccb2a3`](https://github.com/phaseoteam/Phaseo/commit/6ccb2a3efd8e9c8bd218f565ed8daefee123efce) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bound BYOK key hydration and upstream credential attempts for each gateway request.

- [#1756](https://github.com/phaseoteam/Phaseo/pull/1756) [`54a8aa1`](https://github.com/phaseoteam/Phaseo/commit/54a8aa12a0d3af2ea66c3eb8c68c1234c29ed576) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh MiniMax speech, image, music, language, web-search, and video pricing support.

- [#1346](https://github.com/phaseoteam/Phaseo/pull/1346) [`2732b7e`](https://github.com/phaseoteam/Phaseo/commit/2732b7e485de44d51e74a49301fb74ec2ccd9450) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Morph inference routing and pricing for Kimi K3, GLM-5.2, MiniMax M3, Qwen 3.5, Qwen 3.6, DeepSeek V4 Flash, and Gemma 4.

- [#1299](https://github.com/phaseoteam/Phaseo/pull/1299) [`b8c68b2`](https://github.com/phaseoteam/Phaseo/commit/b8c68b2e65bc6ed4be6cfae14e65a80cd852e1c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Increase the monthly BYOK allowance to one million requests and reduce the service fee after the allowance to 2.5%.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record normalized request client attribution, declare official SDK identities, and show request sources in workspace usage logs.

- [#1662](https://github.com/phaseoteam/Phaseo/pull/1662) [`6de47c7`](https://github.com/phaseoteam/Phaseo/commit/6de47c70ebddd779ddda7da8d97a6052d74be3ae) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add automatic, integration-specific API-key provisioning for coding-agent setup, add DeepSeek Harness configuration support, and accept the documented Chat Completions `store` parameter required by Harness.

- [#1286](https://github.com/phaseoteam/Phaseo/pull/1286) [`7be11cd`](https://github.com/phaseoteam/Phaseo/commit/7be11cd461a2cb5243c8e5c3db376cdee879a113) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit discounted data contribution with up to 100% redacted prompt/response retention, independently sampled upstream classification, private R2 storage, persistent task rollups, audited consent controls, and matching CLI and web management surfaces. The feature ships fail-closed behind an admin-only Statsig preview gate. Failed, incomplete, and empty upstream generations are not billed.

- [#1550](https://github.com/phaseoteam/Phaseo/pull/1550) [`0d4eea3`](https://github.com/phaseoteam/Phaseo/commit/0d4eea3f0e0fea041287aade7e48af8434ff5aac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent Gemma 4 thinking from exhausting short completion budgets by defaulting hosted requests to minimal thinking, explicitly accept and document the OpenAI-compatible `reasoning_effort` alias across generated SDKs, correctly map explicit Gemma 4 reasoning controls, and add content-free diagnostics for empty provider responses.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add inherited provider and route geographic availability policies, request-origin country and subdivision enforcement, published upstream restrictions for OpenAI, Anthropic, Gemini API, ElevenLabs, Z.AI, and LongCat, fallback diagnostics, and a dedicated unavailable-region API response. Require users to confirm their location and acknowledge the displayed restrictions before purchasing credits, serve the creator-branded model preview through a short-lived edge-cached web API projection, and collect full billing addresses for new-card checkouts.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep Phaseo Chat in App attribution and enforce an exhaustive Source taxonomy for Direct HTTP, SDKs, agent SDKs, coding agents, and recognized HTTP clients.

- [#1511](https://github.com/phaseoteam/Phaseo/pull/1511) [`e05e541`](https://github.com/phaseoteam/Phaseo/commit/e05e541e5b9f2454ef4232f7ee6a0d4383c70b90) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Apply CrofAI's current open-ended 80% discounted GLM 5.2 token pricing while preserving the existing base rules for historical billing.

- [#1386](https://github.com/phaseoteam/Phaseo/pull/1386) [`6844207`](https://github.com/phaseoteam/Phaseo/commit/6844207e1d784289fb85150bca0b7557fec248e6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the complete official DeepSeek V4 Flash 0731 agent benchmark set and expose the newly catalogued benchmark identifiers through the API and generated SDKs.

- [#1379](https://github.com/phaseoteam/Phaseo/pull/1379) [`cc07f80`](https://github.com/phaseoteam/Phaseo/commit/cc07f808d2bc79305ad06ba2d0a982ddb01d0379) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Model DeepSeek V4 Flash 0731 as a separate catalogue and callable model, preserve the original V4 Flash and its third-party deployments, and move only DeepSeek's current direct route and pricing to the 0731 revision.

- [#1373](https://github.com/phaseoteam/Phaseo/pull/1373) [`ae8874c`](https://github.com/phaseoteam/Phaseo/commit/ae8874cc0c9cba19c774b63aa15cb35d788dfa77) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route official DeepSeek V4 Flash requests through DeepSeek's native Responses API, keep V4 Pro on Chat Completions, refresh V4 Flash metadata and pricing verification, and retire the discontinued direct DeepSeek legacy aliases.

- [#1746](https://github.com/phaseoteam/Phaseo/pull/1746) [`117f53d`](https://github.com/phaseoteam/Phaseo/commit/117f53d7a445de662c2e84362a898187bc2fa6ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route Google AI Studio models through the Gemini API surface they support, restore explicit cached-content requests, omit unsupported task metadata for Gemini Embedding 2, and correct current Gemini API model lifecycles.

- [#1722](https://github.com/phaseoteam/Phaseo/pull/1722) [`c3c2319`](https://github.com/phaseoteam/Phaseo/commit/c3c23192a6475ce625a60a1bcf91678f3f66fa55) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Treat clean empty Novita Macaron streams as length-limited completions instead of upstream failures.

- [#1350](https://github.com/phaseoteam/Phaseo/pull/1350) [`36d540f`](https://github.com/phaseoteam/Phaseo/commit/36d540f9acea4ab024560569e40abd3039256b1d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent Phaseo-only Poolside model suffixes from being sent to the upstream API when a provider-model mapping is missing or stale.

- [#1655](https://github.com/phaseoteam/Phaseo/pull/1655) [`9b40c6f`](https://github.com/phaseoteam/Phaseo/commit/9b40c6f502cc12c6258e2bcdf60b509494d53433) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Baseten as a provider for DeepSeek V4 Pro 0813 while preserving the previous V4 Pro route and pricing history.

- [#1546](https://github.com/phaseoteam/Phaseo/pull/1546) [`6d4bf75`](https://github.com/phaseoteam/Phaseo/commit/6d4bf75a7244ffba98f149b75c55a14c9deeba18) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add complete Seedance 2.5 video pricing context and settlement support while keeping its provider route disabled.

- [#1497](https://github.com/phaseoteam/Phaseo/pull/1497) [`0d9465a`](https://github.com/phaseoteam/Phaseo/commit/0d9465af733b9b8e49385fce716456c05a3585cb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Disable the region-restricted Meta Muse Spark 1.2 Contributor route, document its availability limits, and normalize Fish Audio voice-design request pricing so catalog imports remain valid.

- [#1630](https://github.com/phaseoteam/Phaseo/pull/1630) [`cdc8b7d`](https://github.com/phaseoteam/Phaseo/commit/cdc8b7d8e0a3f7802ab6ff29e9ec61ba8473d736) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral Standard, Batch, and Priority pricing for GLM 5.2, plus EU regional routing and tier-aware billing based on Mistral's observed response tier.

- [#1632](https://github.com/phaseoteam/Phaseo/pull/1632) [`002ded5`](https://github.com/phaseoteam/Phaseo/commit/002ded5934fc6bdb7752995c333bc2ebb2fd96a4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral Batch and Priority reference pricing across eligible catalog entries while keeping Priority routing gated by explicit model capability metadata.

- [#1768](https://github.com/phaseoteam/Phaseo/pull/1768) [`176468a`](https://github.com/phaseoteam/Phaseo/commit/176468a0c01787268c2147bde62faaf0f9590386) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce model-watcher noise and storage: disable Discord alerts for internal Phaseo pricing-rule edits by default, drop Kilo Gateway, NanoGPT, and Hugging Face Router from discovery registries, store compact per-model watch snapshots instead of raw provider payloads, persist only cross-run diff state in run summaries, report official pricing-page changes as added/removed price lines, and enrich the catalog exclusively from live provider fetches.

- [#1340](https://github.com/phaseoteam/Phaseo/pull/1340) [`8bd2813`](https://github.com/phaseoteam/Phaseo/commit/8bd2813d7e0acb4a4fd2335511532efe54102987) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Wafer standard and priority Kimi K3 routing plus CrofAI standard and flex Eco routing with provider-specific pricing.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Novita routes and pricing for Ling 3.0 Tiny, Macaron V1 Tall, and Nemotron 3 Nano 30B A3B. Move Ling 3.0 Flash from its expired free route to current paid pricing, and correct Novita's DeepSeek V4 Flash 0731 route metadata.

- [#1451](https://github.com/phaseoteam/Phaseo/pull/1451) [`62a1456`](https://github.com/phaseoteam/Phaseo/commit/62a1456b5ec517fba206eff5ca865764aa0016b5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add current OpenAI diarized transcription controls and reject unsupported transcription and translation parameter combinations before sending them upstream.

- [#1721](https://github.com/phaseoteam/Phaseo/pull/1721) [`1559d64`](https://github.com/phaseoteam/Phaseo/commit/1559d6495adf3fa7e08f1ad1372e0c928ef465c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add optional user-defined app attribution while keeping SDK client identity separate from workspace apps.

- [#1654](https://github.com/phaseoteam/Phaseo/pull/1654) [`c51e343`](https://github.com/phaseoteam/Phaseo/commit/c51e343fe8f05376a78e82044c6bdfdae20b90aa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Map canonical minimal reasoning effort to DeepSeek's native low effort for the latest V4 models.

- [#1478](https://github.com/phaseoteam/Phaseo/pull/1478) [`62a6496`](https://github.com/phaseoteam/Phaseo/commit/62a649678b3cec07193d8df4ff13ca99e69c55a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bound raw analytics fact scans and ask callers to select a single date when a range is too large.

- [#1761](https://github.com/phaseoteam/Phaseo/pull/1761) [`222029f`](https://github.com/phaseoteam/Phaseo/commit/222029fed95647313ad3c971838e60dddd5fd27f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Aion Labs model availability, lifecycle metadata, limits, capabilities, and current and historical token pricing.

- [#1759](https://github.com/phaseoteam/Phaseo/pull/1759) [`e5fc123`](https://github.com/phaseoteam/Phaseo/commit/e5fc123aa1120b645e5be15ac03ad4d64e9612da) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Google Vertex and Vertex EU model lifecycles, callable routes, and current Gemini, Claude, and Veo pricing.

- [#1753](https://github.com/phaseoteam/Phaseo/pull/1753) [`0cfabaa`](https://github.com/phaseoteam/Phaseo/commit/0cfabaaab70917ea7ffb4b0b6b7dca0e58403342) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Morph model availability, multimodal support, limits, and pricing.

- [#1750](https://github.com/phaseoteam/Phaseo/pull/1750) [`749b6b6`](https://github.com/phaseoteam/Phaseo/commit/749b6b6dea4e4e8ac9e401c85799c2e934368053) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Together serverless model availability, pricing, context limits, vision capabilities, and multimodal image and audio routing.

- [#1720](https://github.com/phaseoteam/Phaseo/pull/1720) [`394f893`](https://github.com/phaseoteam/Phaseo/commit/394f89351773becb2adb3cf4e53aa6b3c68ceb6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep request-log details recoverable when historical fields are missing or loading fails, and attribute Phaseo Chat gateway requests to the Phaseo Chat app.

- [#1610](https://github.com/phaseoteam/Phaseo/pull/1610) [`daf2493`](https://github.com/phaseoteam/Phaseo/commit/daf24935421185104c9b7c03fcad9f0dc44b5394) Thanks [@opencode-agent](https://github.com/apps/opencode-agent)! - Restore latency and generation metadata on successful moderation responses.

- [#1757](https://github.com/phaseoteam/Phaseo/pull/1757) [`ad787df`](https://github.com/phaseoteam/Phaseo/commit/ad787dfecddb6c8c350db2e2418a256adc7e6039) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retire AI21 gateway routes after loss of API dashboard and inference access while preserving historical models and pricing.

- [#937](https://github.com/phaseoteam/Phaseo/pull/937) [`390a840`](https://github.com/phaseoteam/Phaseo/commit/390a8405b3c560fc2f3f4210e42bbb2e86b2430d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add BytePlus Seedream 5.0 Pro catalog, pricing, and gateway image generation/edit support.

- [#1651](https://github.com/phaseoteam/Phaseo/pull/1651) [`c03f9c6`](https://github.com/phaseoteam/Phaseo/commit/c03f9c659e8de088bf27a474f2872809d68b90ba) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forward DeepSeek V4 Pro 0813 reasoning efforts and show recurring time-window pricing changes in model history charts.

- [#1479](https://github.com/phaseoteam/Phaseo/pull/1479) [`d41cb96`](https://github.com/phaseoteam/Phaseo/commit/d41cb96c599b4441666f7a2aeb433df76765b16e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Validate realtime relay credentials and rate-limit unauthenticated relay admission before Durable Object and database work.

- [#1486](https://github.com/phaseoteam/Phaseo/pull/1486) [`de52182`](https://github.com/phaseoteam/Phaseo/commit/de521823fed38c17d99f35ad576f4810b45b68bf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Invalidate cached gateway contexts immediately when response-healing workspace policy changes.

- [#1503](https://github.com/phaseoteam/Phaseo/pull/1503) [`868c9af`](https://github.com/phaseoteam/Phaseo/commit/868c9afb54f0507fc40fd84464fdc9d396803e70) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add direct Upstage routes and pricing for Solar Pro 4, Solar Pro 3, Solar Pro 2, and Solar Mini, including Solar Pro 4's dated launch promotion. Add Solar Open 100B and Solar Open 2 250B metadata, and correct existing Solar model specifications and lineage.

- [#1547](https://github.com/phaseoteam/Phaseo/pull/1547) [`7b5e0a0`](https://github.com/phaseoteam/Phaseo/commit/7b5e0a078be7447ae01e88b7e17775a7d0e0a4ea) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Normalize video inputs and lifecycle handling across xAI, Alibaba Wan and HappyHorse, BytePlus Seedance, Fal, Runway Gen-4.5, Google AI Studio Veo, and Vertex Veo; deliver durable status-change webhooks; and temporarily disable video cancellation. HappyHorse family IDs now route text, first-frame, reference-image, and video-edit requests through the appropriate Alibaba Cloud async model with validated pricing and lifecycle recovery. Runway now uses its mode-specific task endpoints and mandatory API version, Google AI Studio Veo is routable with current pricing, and BytePlus accepts either supported gateway credential name.

- [#1482](https://github.com/phaseoteam/Phaseo/pull/1482) [`f899e80`](https://github.com/phaseoteam/Phaseo/commit/f899e803a0fdeab51086e6f78cb1f37ea21b42a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve usage and billing for successful Google Vertex responses that contain no generated output.

## 1.2.1

### Patch Changes

- [#1255](https://github.com/phaseoteam/Phaseo/pull/1255) [`8f8a349`](https://github.com/phaseoteam/Phaseo/commit/8f8a3494c05c0df6641b065b59fd36533f21f7cf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare Kimi K3 for its public weights release by linking the official Hugging Face repository, surfacing the July 27, 2026 at 15:00 UTC release time, and adding non-routable coming-soon entries for Together, Baseten, and Fireworks.

- [#1257](https://github.com/phaseoteam/Phaseo/pull/1257) [`5a02c19`](https://github.com/phaseoteam/Phaseo/commit/5a02c194d0e64642ddf23cd0d57b2b93983b148c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Represent Baseten GLM-5.2 Fast as a hidden priority service tier for GLM-5.2 instead of a separate canonical model, and refresh the generated SDK model ID snapshots.

## 1.2.0

### Minor Changes

- [#1172](https://github.com/phaseoteam/Phaseo/pull/1172) [`506bd06`](https://github.com/phaseoteam/Phaseo/commit/506bd066513418f19dd4c20b73b98637f035742b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose the asynchronous video API and playground behind coordinated, fail-closed rollout gates while preserving access to already accepted jobs.

- [#1022](https://github.com/phaseoteam/Phaseo/pull/1022) [`f94178d`](https://github.com/phaseoteam/Phaseo/commit/f94178d2a61acc2ab9ebff3893a62d7b3636e3e0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider contract testing, expand gateway provider coverage, and improve model discovery pricing checks.

- [#1015](https://github.com/phaseoteam/Phaseo/pull/1015) [`8144b6c`](https://github.com/phaseoteam/Phaseo/commit/8144b6c7a9f4436345fb25c90de409b801007153) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Unify Amazon Bedrock on the Bedrock Mantle OpenAI-compatible provider, remove the Converse adapter path, and add GPT-5.6 Sol, Terra, and Luna catalog coverage.

### Patch Changes

- [#567](https://github.com/phaseoteam/Phaseo/pull/567) [`b3bbccf`](https://github.com/phaseoteam/Phaseo/commit/b3bbccf8988d6d50f9412d1b91f0518e6a1bcec1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable the public Batch API and Files routes, add managed batch webhook processing, and expose TypeScript SDK helpers for polling batches, listing request rows, and verifying signed webhook deliveries.

- [#1035](https://github.com/phaseoteam/Phaseo/pull/1035) [`66dc5fb`](https://github.com/phaseoteam/Phaseo/commit/66dc5fb500ce46950564c61cba731f1d9893019b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Thinking Machines Lab's Inkling and Inkling-Small models. The canonical Inkling model retains its native 1M-token context and maps to Tinker's 256K variant by default; the shorter Tinker offering is exposed separately as `thinking-machines/inkling-64k`. Inkling-Small is recorded as coming soon because Tinker explicitly lists it as coming soon and no public weights or hosted API identifier were found.

- [#794](https://github.com/phaseoteam/Phaseo/pull/794) [`114713d`](https://github.com/phaseoteam/Phaseo/commit/114713dadf93fe7e722f08f9b31a21324d01daf5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Fireworks model discovery and catalog data to use the serverless-only models feed.

  This updates scheduled discovery to read the serverless Fireworks models route, handle paginated responses, and ignore any non-serverless rows defensively. It also refreshes the Fireworks catalog and pricing data to match the current live serverless inventory.

- [#1190](https://github.com/phaseoteam/Phaseo/pull/1190) [`b369191`](https://github.com/phaseoteam/Phaseo/commit/b369191ad0de6de2ec4850c558b06f2ee72fdbee) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route Gemini 3.6 Flash and Gemini 3.5 Flash-Lite through Google's current Interactions request shape, reject zero-output provider responses for failover, and show a structured error instead of persisting blank chat messages.

- [#948](https://github.com/phaseoteam/Phaseo/pull/948) [`c420a38`](https://github.com/phaseoteam/Phaseo/commit/c420a389be727d45daa13713658cd341081a5d3b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add GPT-5.6 Luna Pro, Sol Pro, and Terra Pro model IDs, routing them to OpenAI with `reasoning.mode=pro` while preserving separate public slugs.

- [#1032](https://github.com/phaseoteam/Phaseo/pull/1032) [`c8cd44c`](https://github.com/phaseoteam/Phaseo/commit/c8cd44cfcc7d6d48eb608dc19635266526a72468) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require explicit gateway consent before third-party OAuth can mint or use a user-funded delegated key, revoke previously issued low-scope keys, make the inference permission clear in the consent and client-management interfaces, and align refresh-token locking with immediate workspace revocation.

  Harden CLI OAuth token validation, local credential storage, Windows authorization URL launching, one-time OAuth client secret output, and backwards-compatible key-cache invalidation during the Phaseo environment-variable transition.

- [#1120](https://github.com/phaseoteam/Phaseo/pull/1120) [`b74b0da`](https://github.com/phaseoteam/Phaseo/commit/b74b0da67485853fc3dcc1f0152422da81b15221) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make time-windowed provider billing use the successful upstream fetch timestamp, persist the exact billing timestamp in pricing lines, avoid request-start fallback when authoritative timing is missing, and expire cached price cards at effective-date boundaries. Prepare DeepSeek V4 pricing rules to use upstream-send timing once official time windows become active. Show the currently active time-window rate in model provider tables and place it ahead of alternate period pricing in provider sheets.

- [#799](https://github.com/phaseoteam/Phaseo/pull/799) [`7d8ee28`](https://github.com/phaseoteam/Phaseo/commit/7d8ee28f7f6bef548111be15caa4de7bcc2c8147) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hook up the Meituan LongCat provider in scheduled model discovery and catalog data.

  This adds LongCat to the API model watcher, accepts the existing `MEITUAN_API_KEY` env alias in the API layer, and adds LongCat provider mapping and pricing data for `meituan/longcat-2.0-preview`.

- [#950](https://github.com/phaseoteam/Phaseo/pull/950) [`685ef25`](https://github.com/phaseoteam/Phaseo/commit/685ef2572a09663ffe417aed33b38e6521317801) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve GPT-5.6 Pro `max` reasoning effort, expose `reasoning.mode` in SDK request types, and send stable OpenAI safety identifiers.

- [#1030](https://github.com/phaseoteam/Phaseo/pull/1030) [`59eca40`](https://github.com/phaseoteam/Phaseo/commit/59eca407417e1df020b2cde66e0489704db8b243) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare Moonshot AI's Kimi K3 catalog entry for its July 16 release with its official 2.8-trillion-parameter architecture, text/image/video input, 1,048,576-token context and output limits, supported API features, and official Moonshot pricing. Add verified GMI Cloud, Novita, and Venice provider availability, provider-specific limits, and pricing. Keep the model links limited to Moonshot's official Kimi K3 API reference, and omit the unpublished Venice E2EE placeholder until Venice exposes a live route and price. Update the Moonshot adapter for K3's top-level max reasoning effort, strict structured outputs, video payloads, and reasoning-content continuity.

- [#1186](https://github.com/phaseoteam/Phaseo/pull/1186) [`50a86ea`](https://github.com/phaseoteam/Phaseo/commit/50a86ead054c28df51fd30bb3267a0c0059205ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Poolside's Laguna S 2.1 model with its free preview gateway route, 1M-token context metadata, and release benchmarks.

- [#972](https://github.com/phaseoteam/Phaseo/pull/972) [`75a2493`](https://github.com/phaseoteam/Phaseo/commit/75a2493decb405a29a1fa29348ce8d6da3d601de) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden CLI OAuth sessions, key-pepper rotation, redirect handling, and abuse controls while moving the CLI to `api.phaseo.app`.

  Add filtered, workspace-scoped, redacted request log listing and per-request inspection to the Phaseo CLI.

- [#1042](https://github.com/phaseoteam/Phaseo/pull/1042) [`9e3749b`](https://github.com/phaseoteam/Phaseo/commit/9e3749bfdd06b2d10278787f7c0cfa67cfa4a56a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden OAuth and gateway-adjacent data access, webhook SSRF validation, error serialization, local credential handling, dependency security, and database RPC permissions following a repository-wide security audit.

- [#1123](https://github.com/phaseoteam/Phaseo/pull/1123) [`8209df0`](https://github.com/phaseoteam/Phaseo/commit/8209df0ed6a72ecf06fddb1f5fa029d73b6b7a20) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Unify and harden Phaseo OAuth discovery, consent, identity, revocation, PKCE, protected-resource binding, and confidential MCP-to-API token exchange across the first-party CLI, user-created applications, and dynamically registered MCP clients.

## 1.1.0

### Minor Changes

- [#690](https://github.com/phaseoteam/Phaseo/pull/690) [`af6ff27`](https://github.com/phaseoteam/Phaseo/commit/af6ff273326b9cadcf103f89eba19bf0fcfcfee0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expand Gateway server tools with Phaseo-branded web search, fetch, managed Advisor, image generation, and apply-patch tools, native web-search/fetch conversion, managed Exa/Parallel/Firecrawl search and fetch controls, domain filters, result caps, billable server-tool pricing meters, and `openai/gpt-image-2` as the default image-generation server-tool model.

### Patch Changes

- [#698](https://github.com/phaseoteam/Phaseo/pull/698) [`0e2b089`](https://github.com/phaseoteam/Phaseo/commit/0e2b08926392579dbfb883be3f5f7947070f7b4f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Moonshot `kimi-k2.7-code` to the catalog and gateway, including direct-provider pricing, subscription-plan coverage, and Moonshot request normalization for the model's stricter thinking, sampling, and tool-choice rules.

- [#562](https://github.com/phaseoteam/Phaseo/pull/562) [`1809a4b`](https://github.com/phaseoteam/Phaseo/commit/1809a4b3d45f198ba9c5f8b079d8b00027aaf742) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden the CLI and OAuth app flows, add dedicated CLI CI coverage, and document the first public Phaseo CLI release surface.

- [#495](https://github.com/phaseoteam/Phaseo/pull/495) [`175d2f2`](https://github.com/phaseoteam/Phaseo/commit/175d2f2ee13e4ff7d99c7285d2532be6ec4996d2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh gateway provider activation and routing coverage across newly added regional providers, audio speech support, and free-router aligned catalogue behavior.

## 1.0.1

### Patch Changes

- Bump gateway API package version for the current backend/runtime updates.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the API and all SDKs for a coordinated breaking release.

  This captures breaking changes across endpoint surfaces, protocol/IR conversions,
  provider routing/usage behavior, and regenerated SDK interfaces from the latest
  OpenAPI definitions.

### Patch Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update gateway and docs for recent API changes and documentation fixes.

## 0.2.0

### Minor Changes

- [#8](https://github.com/phaseoteam/Phaseo/pull/8) [`144dad5`](https://github.com/phaseoteam/Phaseo/commit/144dad5cbf8f56b0e1d987b0eafb9d0be5a98d5e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Updated the Gateway API schema to be a superset of OpenAI’s request/response formats. This alignment is the direction going forward to keep compatibility predictable over time.
