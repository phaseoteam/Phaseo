# @phaseo/gateway-api

## 2.0.0

### Major Changes

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the gateway models response with a Phaseo-native catalogue of lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data. Update the CLI, MCP server, OpenAPI contract, and generated SDK models for the hard cutover, add bounded and validated CIMD OAuth client discovery while retaining dynamic registration, and verify the stateless MCP 2026-07-28 transport. Improve CLI guidance with scoped command-group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.

### Minor Changes

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace notification settings, encrypted destinations, destination testing, and event-routing management APIs.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add complete preset lifecycle management for drafts, versions, forks, upstream updates, publisher handles, and archival.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace member roles, secure invites, and atomic join-request management APIs.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace SSO and SCIM endpoint, token, and audit management with identity add-on enforcement, generated SDKs, docs, and audit events.

- [#1314](https://github.com/phaseoteam/Phaseo/pull/1314) [`7a37f89`](https://github.com/phaseoteam/Phaseo/commit/7a37f8956c26affcaa792ecfbac445bf0c90f218) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add key-scoped dynamic routing flows, searchable model selection with ordered model and provider fallbacks, provider-health suggestions, and 15-minute cache-aware plus session-aware provider affinity.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add typed workspace settings and versioned dynamic-route management APIs across the gateway, documentation, and generated SDKs.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish feature-gated data-contribution consent, classifier lifecycle, analytics, generated SDKs, reference documentation, and audit events.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish request log, feedback, custom event, and preset evaluation-run API contracts.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add API-key rotation, cache invalidation, complete limit metadata, generated SDK methods, documentation, and audit events.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add public enterprise directory, department, member override, membership, and directory group-mapping management APIs.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish scoped management-key CRUD across the gateway, generated SDKs, reference documentation, and workspace audit log.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add enforced workspace budget management APIs and expose complete API-key limit and usage windows.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add per-model endpoint capability discovery, public model-filter aliases, and a capability-backed endpoint catalogue across the API, documentation, and generated SDKs.

- [#1369](https://github.com/phaseoteam/Phaseo/pull/1369) [`3fa9feb`](https://github.com/phaseoteam/Phaseo/commit/3fa9febba8782b0f37baf7d913ad52051273507f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider-qualified model identifiers for exact provider-model routing while preserving canonical model suffixes and existing workspace routing safeguards.

- [#1666](https://github.com/phaseoteam/Phaseo/pull/1666) [`b690c19`](https://github.com/phaseoteam/Phaseo/commit/b690c195943491b9706ac445140f686f1f75b557) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Overhaul provider protocol, capability, media, batch, usage, and catalog contracts against current first-party API documentation.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add encrypted observability destination management with key and event filters.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish guardrail policy and key/member assignment management across the gateway, generated SDKs, reference documentation, and workspace audit log.

- [#1311](https://github.com/phaseoteam/Phaseo/pull/1311) [`1c19590`](https://github.com/phaseoteam/Phaseo/commit/1c1959073bd258debda77cc73590bd43e320eecc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden Batch and Video request validation, billing, managed webhooks, media fetching, bounded streaming, and asynchronous settlement. Video webhook configuration now requires a managed endpoint ID, output counts are capped and fully billed, and raw provider request overrides are rejected.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add filtered, paginated workspace analytics and spreadsheet-safe CSV export across the gateway and generated SDKs.

- [#1447](https://github.com/phaseoteam/Phaseo/pull/1447) [`2280801`](https://github.com/phaseoteam/Phaseo/commit/2280801bd70f0ade92f30c728a61fc04b0f0808c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add first-class Subagent, Fusion, and model-catalogue search server tools, strengthen server-tool limits and usage reporting, and standardize Phaseo tool naming.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace gateway application metadata and history-merge management APIs.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish OAuth application and async webhook endpoint management with generated SDKs, reference docs, one-time secret handling, and audit events.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace-scoped Private Models with encrypted OpenAI-compatible endpoint credentials, management APIs, model discovery, and gateway routing.

### Patch Changes

- [#2118](https://github.com/phaseoteam/Phaseo/pull/2118) [`4d264b8`](https://github.com/phaseoteam/Phaseo/commit/4d264b88e08566f9fb0c62609b0cb6ec3a41f8f9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add verified Alibaba Cloud Model Studio Wan 3.0 Video and Wan 3.0 Video Prime routes, model metadata, native async video support, and resolution-based input/output video pricing.

- [#2055](https://github.com/phaseoteam/Phaseo/pull/2055) [`577ec42`](https://github.com/phaseoteam/Phaseo/commit/577ec42a1a73a46e54287c878f2ed948a48a682e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Statsig-gated Alpha for the `phaseo/auto` model router with a separately metered low-cost classifier request, complexity-aware capability scoring, a managed text-model universe, workspace spend profiles and pattern restrictions, routing diagnostics, retryable model fallbacks, and a dedicated Auto Routing settings page.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Cohere Parse v5.0, the `/v1/parse` document parsing endpoint, page metering, and generated SDK operations and models.

- [#2156](https://github.com/phaseoteam/Phaseo/pull/2156) [`89d252a`](https://github.com/phaseoteam/Phaseo/commit/89d252ac13ed0392bcd5f6f37fb8a122ef421df1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add DeepInfra DeepSeek V4 Flash Vision Exp, Novita Ling 3.0 Flash Sante and VL, and Baseten GLM 5.3 Fast priority routing and pricing. Retire Grok Imagine Image Quality without fallback routing and complete the Grok Imagine Image 2.0 catalog metadata.

- [#1760](https://github.com/phaseoteam/Phaseo/pull/1760) [`7112de0`](https://github.com/phaseoteam/Phaseo/commit/7112de09ae6537562c746b03ccfd8409247750ac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add DeepSeek V4 Flash Vision Exp with image input support, verified pricing, and generated SDK model identifiers.

- [#1978](https://github.com/phaseoteam/Phaseo/pull/1978) [`8436889`](https://github.com/phaseoteam/Phaseo/commit/8436889887108c0acd1c27e80bffcb7f75efaa5f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add IO.NET as an OpenAI-compatible gateway provider with its live model catalog, capabilities, and token pricing.

- [#2029](https://github.com/phaseoteam/Phaseo/pull/2029) [`ebfc0ee`](https://github.com/phaseoteam/Phaseo/commit/ebfc0ee29f29f7ea0062ad34b3623bd30b47758e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Register Tencent Cloud TokenHub as an OpenAI-compatible text provider with the current international model scope, capture USD pricing, and expose its API-key onboarding metadata. Exclude vendor-direct, Kinfra, and media routes; keep the scoped routes disabled pending live API-key smoke testing.

- [#2023](https://github.com/phaseoteam/Phaseo/pull/2023) [`c971c71`](https://github.com/phaseoteam/Phaseo/commit/c971c71aeb42e89c95b8db034c60f618466ba2f8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Tencent Hy4 Preview as a 1M-context model with GMICloud routing and pricing metadata.

- [#2124](https://github.com/phaseoteam/Phaseo/pull/2124) [`4b83433`](https://github.com/phaseoteam/Phaseo/commit/4b83433528c0fec4dc82160c61cc76ba4f58add7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add TinyFish Search as an optional managed `phaseo:web_search` engine with localized, paginated queries, translated domain filters, and free-provider cost handling.

- [#1935](https://github.com/phaseoteam/Phaseo/pull/1935) [`1c2c62e`](https://github.com/phaseoteam/Phaseo/commit/1c2c62e9ee48bf442f4b63f5379517b028633135) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add W&B routing for GLM 5.3 Flash and Novita's free Ling 3.0 Flash Fin model.

- [#1796](https://github.com/phaseoteam/Phaseo/pull/1796) [`ed53721`](https://github.com/phaseoteam/Phaseo/commit/ed537215181130cdc164c6c1a9c906aca39549bc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace notification settings with encrypted Email, Discord, Slack, Microsoft Teams, and custom webhook destinations, synchronous connection tests, mentions, retries, and model deprecation alerts.

- [#2082](https://github.com/phaseoteam/Phaseo/pull/2082) [`e832fd0`](https://github.com/phaseoteam/Phaseo/commit/e832fd00a6319f70e218907564ca2660720db5f2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align provider parameter metadata and gateway adapters with current first-party model documentation.

- [#1786](https://github.com/phaseoteam/Phaseo/pull/1786) [`94f67fb`](https://github.com/phaseoteam/Phaseo/commit/94f67fbadf8f1171fb45e280c9f6fb5ea1940cab) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Audit Baseten shared Model APIs, refresh active routes and pricing, and model GLM-5.2 Fast as a service tier.

- [#1792](https://github.com/phaseoteam/Phaseo/pull/1792) [`4c5f19c`](https://github.com/phaseoteam/Phaseo/commit/4c5f19c7c905b4a8c836ae08dc6fddec6b00c8b1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Groq model lifecycles and enable the current Whisper transcription routes with verified audio pricing.

- [#1315](https://github.com/phaseoteam/Phaseo/pull/1315) [`57c16c3`](https://github.com/phaseoteam/Phaseo/commit/57c16c37abb38be1d7cdb821775e8b0f056bc1dd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Move Amazon Bedrock text inference onto Mantle Responses, Chat Completions, and Anthropic Messages, and correct catalog reference validation so supported legacy identities and API-model aliases resolve without warnings.

- [#1799](https://github.com/phaseoteam/Phaseo/pull/1799) [`129b34d`](https://github.com/phaseoteam/Phaseo/commit/129b34d857473a464486d10b6bd4aeb65aab65a3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add validated app-category attribution through request headers and the TypeScript SDK.

- [#1798](https://github.com/phaseoteam/Phaseo/pull/1798) [`da20836`](https://github.com/phaseoteam/Phaseo/commit/da208361bd5a7d5e208e414826c62754f4e5263f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Activate Canopy Wave routing and reconcile its current serverless model catalogue, lifecycle history, service tiers, and pricing.

- [#1652](https://github.com/phaseoteam/Phaseo/pull/1652) [`c13a9f9`](https://github.com/phaseoteam/Phaseo/commit/c13a9f93516fb718e48acdc2605b9402212599ca) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forward documented reasoning efforts for the latest DeepSeek V4 Flash model.

- [#1480](https://github.com/phaseoteam/Phaseo/pull/1480) [`6ccb2a3`](https://github.com/phaseoteam/Phaseo/commit/6ccb2a3efd8e9c8bd218f565ed8daefee123efce) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bound BYOK key hydration and upstream credential attempts for each gateway request.

- [#1753](https://github.com/phaseoteam/Phaseo/pull/1753) [`0cfabaa`](https://github.com/phaseoteam/Phaseo/commit/0cfabaaab70917ea7ffb4b0b6b7dca0e58403342) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh MiniMax speech, image, music, language, web-search, and video pricing support.

- [#1346](https://github.com/phaseoteam/Phaseo/pull/1346) [`2732b7e`](https://github.com/phaseoteam/Phaseo/commit/2732b7e485de44d51e74a49301fb74ec2ccd9450) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Morph inference routing and pricing for Kimi K3, GLM-5.2, MiniMax M3, Qwen 3.5, Qwen 3.6, DeepSeek V4 Flash, and Gemma 4.

- [#1299](https://github.com/phaseoteam/Phaseo/pull/1299) [`b8c68b2`](https://github.com/phaseoteam/Phaseo/commit/b8c68b2e65bc6ed4be6cfae14e65a80cd852e1c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Increase the monthly BYOK allowance to one million requests and reduce the service fee after the allowance to 2.5%.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record normalized request client attribution, declare official SDK identities, and show request sources in workspace usage logs.

- [#1662](https://github.com/phaseoteam/Phaseo/pull/1662) [`6de47c7`](https://github.com/phaseoteam/Phaseo/commit/6de47c70ebddd779ddda7da8d97a6052d74be3ae) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add automatic, integration-specific API-key provisioning for coding-agent setup, add DeepSeek Harness configuration support, and accept the documented Chat Completions `store` parameter required by Harness.

- [#1286](https://github.com/phaseoteam/Phaseo/pull/1286) [`7be11cd`](https://github.com/phaseoteam/Phaseo/commit/7be11cd461a2cb5243c8e5c3db376cdee879a113) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit discounted data contribution with up to 100% redacted prompt/response retention, independently sampled upstream classification, private R2 storage, persistent task rollups, audited consent controls, and matching CLI and web management surfaces. The feature ships fail-closed behind an admin-only Statsig preview gate. Failed, incomplete, and empty upstream generations are not billed.

- [#1550](https://github.com/phaseoteam/Phaseo/pull/1550) [`0d4eea3`](https://github.com/phaseoteam/Phaseo/commit/0d4eea3f0e0fea041287aade7e48af8434ff5aac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent Gemma 4 thinking from exhausting short completion budgets by defaulting hosted requests to minimal thinking, explicitly accept and document the OpenAI-compatible `reasoning_effort` alias across generated SDKs, correctly map explicit Gemma 4 reasoning controls, and add content-free diagnostics for empty provider responses.

- [#2090](https://github.com/phaseoteam/Phaseo/pull/2090) [`649dc00`](https://github.com/phaseoteam/Phaseo/commit/649dc00ee648c17349807a2c77628b7c66f55537) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show model performance as hourly provider trends over seven days, validate tool calls and structured responses by failure reason, calculate cache reuse from cached-read and input tokens, surface ordinary performance and uptime observations from the first request, and compact the model uptime presentation. Cache-derived metrics retain their larger telemetry threshold.

- [#2172](https://github.com/phaseoteam/Phaseo/pull/2172) [`7aad05e`](https://github.com/phaseoteam/Phaseo/commit/7aad05ead90900e5937416c21c6997436d75b957) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add database-configured request and token limits for managed provider capacity with approximate global enforcement and provider failover.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add inherited provider and route geographic availability policies, request-origin country and subdivision enforcement, published upstream restrictions for OpenAI, Anthropic, Gemini API, ElevenLabs, Z.AI, and LongCat, fallback diagnostics, and a dedicated unavailable-region API response. Require users to confirm their location and acknowledge the displayed restrictions before purchasing credits, serve the creator-branded model preview through a short-lived edge-cached web API projection, and collect full billing addresses for new-card checkouts.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep Phaseo Chat in App attribution and enforce an exhaustive Source taxonomy for Direct HTTP, SDKs, agent SDKs, coding agents, and recognized HTTP clients.

- [#2011](https://github.com/phaseoteam/Phaseo/pull/2011) [`5af6dc0`](https://github.com/phaseoteam/Phaseo/commit/5af6dc01471f7ea69cf574103db4c421d75501f2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record complete routing traces, align balanced scoring with latency and throughput, and classify provider uptime failures consistently.

- [#2084](https://github.com/phaseoteam/Phaseo/pull/2084) [`b63311a`](https://github.com/phaseoteam/Phaseo/commit/b63311ad02a183b2d89d1b6e840986cf917cdcea) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent unmatched interactive-tier pricing conditions from producing unbilled provider usage.

- [#1511](https://github.com/phaseoteam/Phaseo/pull/1511) [`e05e541`](https://github.com/phaseoteam/Phaseo/commit/e05e541e5b9f2454ef4232f7ee6a0d4383c70b90) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Apply CrofAI's current open-ended 80% discounted GLM 5.2 token pricing while preserving the existing base rules for historical billing.

- [#1940](https://github.com/phaseoteam/Phaseo/pull/1940) [`a125b93`](https://github.com/phaseoteam/Phaseo/commit/a125b9361c9b46e95f7d1e223f11342b9f9aa832) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable DeepInfra support for IBM Granite 4.2 3B, 8B, and 30B with verified routing, capabilities, pricing, and generated SDK model identifiers.

- [#1386](https://github.com/phaseoteam/Phaseo/pull/1386) [`6844207`](https://github.com/phaseoteam/Phaseo/commit/6844207e1d784289fb85150bca0b7557fec248e6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the complete official DeepSeek V4 Flash 0731 agent benchmark set and expose the newly catalogued benchmark identifiers through the API and generated SDKs.

- [#1379](https://github.com/phaseoteam/Phaseo/pull/1379) [`cc07f80`](https://github.com/phaseoteam/Phaseo/commit/cc07f808d2bc79305ad06ba2d0a982ddb01d0379) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Model DeepSeek V4 Flash 0731 as a separate catalogue and callable model, preserve the original V4 Flash and its third-party deployments, and move only DeepSeek's current direct route and pricing to the 0731 revision.

- [#1373](https://github.com/phaseoteam/Phaseo/pull/1373) [`ae8874c`](https://github.com/phaseoteam/Phaseo/commit/ae8874cc0c9cba19c774b63aa15cb35d788dfa77) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route official DeepSeek V4 Flash requests through DeepSeek's native Responses API, keep V4 Pro on Chat Completions, refresh V4 Flash metadata and pricing verification, and retire the discontinued direct DeepSeek legacy aliases.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable Cohere production routes for chat, embeddings, and reranking, and catalogue its transcription API.

- [#2199](https://github.com/phaseoteam/Phaseo/pull/2199) [`f70bacd`](https://github.com/phaseoteam/Phaseo/commit/f70bacddf9c664bf27be9812f9ddefec5007a1ce) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route GPT-6 Astra through OpenAI for accounts included in the limited-access rollout.

- [#1810](https://github.com/phaseoteam/Phaseo/pull/1810) [`9eb5474`](https://github.com/phaseoteam/Phaseo/commit/9eb547459ac0b5ed260cacfbb6a85a6467db7a85) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enforce provider-model quantization routing filters using catalogue metadata and return explicit diagnostics when no eligible offer matches.

- [#2205](https://github.com/phaseoteam/Phaseo/pull/2205) [`5e9a579`](https://github.com/phaseoteam/Phaseo/commit/5e9a579792f3ca273792a10ac02bc0de2eec2a2c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce cold gateway overhead by joining pricing reads, coalescing provider limit configuration loads, and persisting authentication caches in the background. Reuse BYOK master-key imports within each request and include private-model lookups and BYOK hydration in context timings.
  
  Skip repeated private-model lookups using a bounded five-second metadata index. Retain fresh credential and routing reads for matching private models, and invalidate gateway key caches after account private-model mutations.

- [#1797](https://github.com/phaseoteam/Phaseo/pull/1797) [`5cba296`](https://github.com/phaseoteam/Phaseo/commit/5cba296c98ea94813b767348ad507389711660fc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route CrofAI priority and flex requests through their hidden tier-specific provider slugs.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix conditional pricing fallback behavior, align provider capability registration with executable endpoints, and add Xiaomi audio transcription support.

- [#1746](https://github.com/phaseoteam/Phaseo/pull/1746) [`117f53d`](https://github.com/phaseoteam/Phaseo/commit/117f53d7a445de662c2e84362a898187bc2fa6ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route Google AI Studio models through the Gemini API surface they support, restore explicit cached-content requests, omit unsupported task metadata for Gemini Embedding 2, and correct current Gemini API model lifecycles.

- [#1722](https://github.com/phaseoteam/Phaseo/pull/1722) [`c3c2319`](https://github.com/phaseoteam/Phaseo/commit/c3c23192a6475ce625a60a1bcf91678f3f66fa55) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Treat clean empty Novita Macaron streams as length-limited completions instead of upstream failures.

- [#1350](https://github.com/phaseoteam/Phaseo/pull/1350) [`36d540f`](https://github.com/phaseoteam/Phaseo/commit/36d540f9acea4ab024560569e40abd3039256b1d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent Phaseo-only Poolside model suffixes from being sent to the upstream API when a provider-model mapping is missing or stale.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish Stealth Ox Alpha under the canonical `stealth/ox-alpha` model ID while retaining Venice as its inference provider.

- [#2166](https://github.com/phaseoteam/Phaseo/pull/2166) [`5d348fa`](https://github.com/phaseoteam/Phaseo/commit/5d348fabebdd0b3e6602b49f2967d14df969140d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject conflicting Grok Imagine Image 2.0 size aliases and keep the upstream resolution and billing dimensions aligned.

- [#1655](https://github.com/phaseoteam/Phaseo/pull/1655) [`9b40c6f`](https://github.com/phaseoteam/Phaseo/commit/9b40c6f502cc12c6258e2bcdf60b509494d53433) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Baseten as a provider for DeepSeek V4 Pro 0813 while preserving the previous V4 Pro route and pricing history.

- [#1970](https://github.com/phaseoteam/Phaseo/pull/1970) [`828f835`](https://github.com/phaseoteam/Phaseo/commit/828f8357e31c326fa7ffa9f9b796a5d74f4839d8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh CrofAI model availability, metadata, and token pricing from its current live model payload.

- [#1546](https://github.com/phaseoteam/Phaseo/pull/1546) [`6d4bf75`](https://github.com/phaseoteam/Phaseo/commit/6d4bf75a7244ffba98f149b75c55a14c9deeba18) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add complete Seedance 2.5 video pricing context and settlement support while keeping its provider route disabled.

- [#1922](https://github.com/phaseoteam/Phaseo/pull/1922) [`a712680`](https://github.com/phaseoteam/Phaseo/commit/a71268072337da9b32159dcfe66862c3011b11c8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add MiniMax Week x GMI Cloud free access (2026-08-24 through 2026-09-06) for MiniMax M3, M2.7, Speech 2.8, and Music 3.0. Close GMI Cloud standard pricing during the promo window and resume it afterward, author `:free` model variants with matching GMI provider routes and zero-priced entries, add the missing canonical MiniMax Speech 2.8 model record, and route GMICloud speech/music requests through the native request-queue executors and IR.

- [#1949](https://github.com/phaseoteam/Phaseo/pull/1949) [`ee89c9e`](https://github.com/phaseoteam/Phaseo/commit/ee89c9e4450b0cf4b68b04784a26aa37c0f73f4e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Correct GMICloud MiniMax Music 3.0 payload formatting and supply the native audio settings defaults required for music generation.

- [#1950](https://github.com/phaseoteam/Phaseo/pull/1950) [`c0237ed`](https://github.com/phaseoteam/Phaseo/commit/c0237ed49d4ae38000f4c9268275e096ca35fb93) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Support prompt-only GMICloud MiniMax Music 3.0 requests by supplying the provider-required instrumental lyrics marker.

- [#2051](https://github.com/phaseoteam/Phaseo/pull/2051) [`7797801`](https://github.com/phaseoteam/Phaseo/commit/7797801c8ce12ba99e305aa8d44f2d66013e147a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden request validation, provider routing, local tooling, and generated client handling.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Disable the region-restricted Meta Muse Spark 1.2 Contributor route, document its availability limits, and normalize Fish Audio voice-design request pricing so catalog imports remain valid.

- [#1969](https://github.com/phaseoteam/Phaseo/pull/1969) [`78bea5a`](https://github.com/phaseoteam/Phaseo/commit/78bea5aa8de6e6cc14e2ad3869810d69b8da6914) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Meta Muse Image 1.0 generation and editing through Meta's OpenAI-compatible image endpoints, including active routing, catalog metadata, and image billing.

- [#1630](https://github.com/phaseoteam/Phaseo/pull/1630) [`cdc8b7d`](https://github.com/phaseoteam/Phaseo/commit/cdc8b7d8e0a3f7802ab6ff29e9ec61ba8473d736) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral Standard, Batch, and Priority pricing for GLM 5.2, plus EU regional routing and tier-aware billing based on Mistral's observed response tier.

- [#1632](https://github.com/phaseoteam/Phaseo/pull/1632) [`002ded5`](https://github.com/phaseoteam/Phaseo/commit/002ded5934fc6bdb7752995c333bc2ebb2fd96a4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral Batch and Priority reference pricing across eligible catalog entries while keeping Priority routing gated by explicit model capability metadata.

- [#1768](https://github.com/phaseoteam/Phaseo/pull/1768) [`176468a`](https://github.com/phaseoteam/Phaseo/commit/176468a0c01787268c2147bde62faaf0f9590386) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce model-watcher noise and storage: disable Discord alerts for internal Phaseo pricing-rule edits by default, drop Kilo Gateway, NanoGPT, and Hugging Face Router from discovery registries, store compact per-model watch snapshots instead of raw provider payloads, persist only cross-run diff state in run summaries, report official pricing-page changes as added/removed price lines, and enrich the catalog exclusively from live provider fetches.

- [#1340](https://github.com/phaseoteam/Phaseo/pull/1340) [`8bd2813`](https://github.com/phaseoteam/Phaseo/commit/8bd2813d7e0acb4a4fd2335511532efe54102987) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Wafer standard and priority Kimi K3 routing plus CrofAI standard and flex Eco routing with provider-specific pricing.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Novita routes and pricing for Ling 3.0 Tiny, Macaron V1 Tall, and Nemotron 3 Nano 30B A3B. Move Ling 3.0 Flash from its expired free route to current paid pricing, and correct Novita's DeepSeek V4 Flash 0731 route metadata.

- [#1451](https://github.com/phaseoteam/Phaseo/pull/1451) [`62a1456`](https://github.com/phaseoteam/Phaseo/commit/62a1456b5ec517fba206eff5ca865764aa0016b5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add current OpenAI diarized transcription controls and reject unsupported transcription and translation parameter combinations before sending them upstream.

- [#1814](https://github.com/phaseoteam/Phaseo/pull/1814) [`cd8b10a`](https://github.com/phaseoteam/Phaseo/commit/cd8b10a51d496988cfaaff7cdd033f06e8255991) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make `:nitro`, `:cheap`, and `:fast` model routing suffixes take precedence over conflicting request, preset, and workspace routing modes.

- [#2004](https://github.com/phaseoteam/Phaseo/pull/2004) [`e877553`](https://github.com/phaseoteam/Phaseo/commit/e877553e68bb1477d071cf2b56cf2db8d131d7cf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Protect database-owned stealth routes from catalogue reconciliation and expose their provider identity as `stealth` across public model and pricing surfaces.

- [#1721](https://github.com/phaseoteam/Phaseo/pull/1721) [`1559d64`](https://github.com/phaseoteam/Phaseo/commit/1559d6495adf3fa7e08f1ad1372e0c928ef465c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add optional user-defined app attribution while keeping SDK client identity separate from workspace apps.

- [#2204](https://github.com/phaseoteam/Phaseo/pull/2204) [`dc62aae`](https://github.com/phaseoteam/Phaseo/commit/dc62aae435fad54fac9601fb698921aaf563bfd4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the GPT-6 Astra Pro model variant with provider metadata, pricing, generated model identifiers, and OpenAI routing that normalizes to `gpt-6-astra` with `reasoning.mode=pro`.

- [#1654](https://github.com/phaseoteam/Phaseo/pull/1654) [`c51e343`](https://github.com/phaseoteam/Phaseo/commit/c51e343fe8f05376a78e82044c6bdfdae20b90aa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Map canonical minimal reasoning effort to DeepSeek's native low effort for the latest V4 models.

- [#2165](https://github.com/phaseoteam/Phaseo/pull/2165) [`ae35df2`](https://github.com/phaseoteam/Phaseo/commit/ae35df23af2d1041bf02d6bc9dee15b2b14f7a25) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add EU and US regional provider-routing deployments, region-filtered model discovery, text-only regional request enforcement, and SDK region selection.

- [#1478](https://github.com/phaseoteam/Phaseo/pull/1478) [`62a6496`](https://github.com/phaseoteam/Phaseo/commit/62a649678b3cec07193d8df4ff13ca99e69c55a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bound raw analytics fact scans and ask callers to select a single date when a range is too large.

- [#1761](https://github.com/phaseoteam/Phaseo/pull/1761) [`222029f`](https://github.com/phaseoteam/Phaseo/commit/222029fed95647313ad3c971838e60dddd5fd27f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Aion Labs model availability, lifecycle metadata, limits, capabilities, and current and historical token pricing.

- [#1759](https://github.com/phaseoteam/Phaseo/pull/1759) [`e5fc123`](https://github.com/phaseoteam/Phaseo/commit/e5fc123aa1120b645e5be15ac03ad4d64e9612da) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Google Vertex and Vertex EU model lifecycles, callable routes, and current Gemini, Claude, and Veo pricing.

- [#1753](https://github.com/phaseoteam/Phaseo/pull/1753) [`0cfabaa`](https://github.com/phaseoteam/Phaseo/commit/0cfabaaab70917ea7ffb4b0b6b7dca0e58403342) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Morph model availability, multimodal support, limits, and pricing.

- [#1750](https://github.com/phaseoteam/Phaseo/pull/1750) [`749b6b6`](https://github.com/phaseoteam/Phaseo/commit/749b6b6dea4e4e8ac9e401c85799c2e934368053) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Together serverless model availability, pricing, context limits, vision capabilities, and multimodal image and audio routing.

- [#2049](https://github.com/phaseoteam/Phaseo/pull/2049) [`89b9fe6`](https://github.com/phaseoteam/Phaseo/commit/89b9fe6fe054d2efcecea0556b77559d83ab826b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add request labels for spend attribution and expose label filtering in the usage dashboard.

- [#2178](https://github.com/phaseoteam/Phaseo/pull/2178) [`8372bd3`](https://github.com/phaseoteam/Phaseo/commit/8372bd3c80cf0d3a956574e4fefa31ec8e95cbb3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reserve managed-provider token capacity before dispatch and reconcile reservations with final usage.

- [#1720](https://github.com/phaseoteam/Phaseo/pull/1720) [`394f893`](https://github.com/phaseoteam/Phaseo/commit/394f89351773becb2adb3cf4e53aa6b3c68ceb6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep request-log details recoverable when historical fields are missing or loading fails, and attribute Phaseo Chat gateway requests to the Phaseo Chat app.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore latency and generation metadata on successful moderation responses.

- [#1757](https://github.com/phaseoteam/Phaseo/pull/1757) [`ad787df`](https://github.com/phaseoteam/Phaseo/commit/ad787dfecddb6c8c350db2e2418a256adc7e6039) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retire AI21 gateway routes after loss of API dashboard and inference access while preserving historical models and pricing.

- [#2186](https://github.com/phaseoteam/Phaseo/pull/2186) [`f298a5c`](https://github.com/phaseoteam/Phaseo/commit/f298a5cf761bbe7dcaafabb961d1e6a635e83dac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route Gemini 3.8 Flash through Google AI Studio and Google Vertex with Standard, Batch, Flex, and Priority service-tier metadata.

- [#1830](https://github.com/phaseoteam/Phaseo/pull/1830) [`7626284`](https://github.com/phaseoteam/Phaseo/commit/7626284bedd85de7c5ad34e0792e384a17143fa5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Let workspace administrators choose notification destinations separately for each alert type.

- [#1960](https://github.com/phaseoteam/Phaseo/pull/1960) [`0fd6d09`](https://github.com/phaseoteam/Phaseo/commit/0fd6d09aee5a621b0ca03f9212b5f968626436da) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Safely expose retry guidance and BYOK provider rate-limit metadata on upstream failures.

- [#2211](https://github.com/phaseoteam/Phaseo/pull/2211) [`d2fcb05`](https://github.com/phaseoteam/Phaseo/commit/d2fcb056f4c1b117ac1b1717087594564380c22c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require compatible service-tier pricing, protect private endpoint credentials and tier health telemetry, and correct provider routing metadata.

- [#937](https://github.com/phaseoteam/Phaseo/pull/937) [`390a840`](https://github.com/phaseoteam/Phaseo/commit/390a8405b3c560fc2f3f4210e42bbb2e86b2430d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add BytePlus Seedream 5.0 Pro catalog, pricing, and gateway image generation/edit support.

- [#2182](https://github.com/phaseoteam/Phaseo/pull/2182) [`d230b18`](https://github.com/phaseoteam/Phaseo/commit/d230b1898fe3216b14aab22b7e1861f2cdf4bea7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Release managed-provider token reservations when upstream client validation rejects a request before inference.

- [#1651](https://github.com/phaseoteam/Phaseo/pull/1651) [`c03f9c6`](https://github.com/phaseoteam/Phaseo/commit/c03f9c659e8de088bf27a474f2872809d68b90ba) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forward DeepSeek V4 Pro 0813 reasoning efforts and show recurring time-window pricing changes in model history charts.

- [#2196](https://github.com/phaseoteam/Phaseo/pull/2196) [`8f93b5b`](https://github.com/phaseoteam/Phaseo/commit/8f93b5be0558102e2a555573b81581b30671dda2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show mapped model providers and published pricing even before their Phaseo gateway route is active, including Astra's coming-soon OpenAI pricing. Attribute runtime health and performance to individual provider service tiers and sort each tier independently.

- [#2192](https://github.com/phaseoteam/Phaseo/pull/2192) [`db6655d`](https://github.com/phaseoteam/Phaseo/commit/db6655d67f421c5da80e6113f8e1b94a58f2149c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Correct GPT-6 Astra parameter metadata, preserve OpenAI Responses async tool settings, and pass OpenAI prompt cache options through the gateway.

- [#2193](https://github.com/phaseoteam/Phaseo/pull/2193) [`55cce64`](https://github.com/phaseoteam/Phaseo/commit/55cce64901cd00c4bc430239ef215ef0ba9dfc28) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Accept optional async tool declarations on Chat Completions, Responses, and Messages requests, forwarding them only to OpenAI Responses providers.

- [#2116](https://github.com/phaseoteam/Phaseo/pull/2116) [`e6c5e17`](https://github.com/phaseoteam/Phaseo/commit/e6c5e17aa116dec6557da3de1a6fe720ca7eaee5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Support both MiniMax V1 video generation models and the V2 MiniMax-H3 / MiniMax-H3-Max multimodal video lifecycle.

- [#1479](https://github.com/phaseoteam/Phaseo/pull/1479) [`d41cb96`](https://github.com/phaseoteam/Phaseo/commit/d41cb96c599b4441666f7a2aeb433df76765b16e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Validate realtime relay credentials and rate-limit unauthenticated relay admission before Durable Object and database work.

- [#1800](https://github.com/phaseoteam/Phaseo/pull/1800) [`6a11076`](https://github.com/phaseoteam/Phaseo/commit/6a110767efcf8d5e885bfc3e14c749ab7af4f437) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Activate Sail Research with current models, completion-window routing, and tiered pricing.

- [#1486](https://github.com/phaseoteam/Phaseo/pull/1486) [`de52182`](https://github.com/phaseoteam/Phaseo/commit/de521823fed38c17d99f35ad576f4810b45b68bf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Invalidate cached gateway contexts immediately when response-healing workspace policy changes.

- [#1893](https://github.com/phaseoteam/Phaseo/pull/1893) [`fb585b7`](https://github.com/phaseoteam/Phaseo/commit/fb585b73a02756e2e6ae30798878f78f8c551b76) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile TensorX's complete live model catalogue and pricing, preserve delisted model history, and enable verified chat and embedding routes.

- [#1896](https://github.com/phaseoteam/Phaseo/pull/1896) [`6c5524d`](https://github.com/phaseoteam/Phaseo/commit/6c5524d9fae94d5b9f24d6928e6f10685757c983) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Upstage Embed 2 and legacy Embed aliases, complete Document Intelligence catalog coverage, and expose Upstage embeddings through the gateway.

- [#1952](https://github.com/phaseoteam/Phaseo/pull/1952) [`a41bbea`](https://github.com/phaseoteam/Phaseo/commit/a41bbea83f62c29980d3737ca819f67752c309a6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Unify music generation lifecycle handling across providers with Phaseo request IDs and provider-independent retrieval snapshots.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add direct Upstage routes and pricing for Solar Pro 4, Solar Pro 3, Solar Pro 2, and Solar Mini, including Solar Pro 4's dated launch promotion. Add Solar Open 100B and Solar Open 2 250B metadata, and correct existing Solar model specifications and lineage.

- [#1547](https://github.com/phaseoteam/Phaseo/pull/1547) [`7b5e0a0`](https://github.com/phaseoteam/Phaseo/commit/7b5e0a078be7447ae01e88b7e17775a7d0e0a4ea) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Normalize video inputs and lifecycle handling across xAI, Alibaba Wan and HappyHorse, BytePlus Seedance, Fal, Runway Gen-4.5, Google AI Studio Veo, and Vertex Veo; deliver durable status-change webhooks; and temporarily disable video cancellation. HappyHorse family IDs now route text, first-frame, reference-image, and video-edit requests through the appropriate Alibaba Cloud async model with validated pricing and lifecycle recovery. Runway now uses its mode-specific task endpoints and mandatory API version, Google AI Studio Veo is routable with current pricing, and BytePlus accepts either supported gateway credential name.

- [#1935](https://github.com/phaseoteam/Phaseo/pull/1935) [`1c2c62e`](https://github.com/phaseoteam/Phaseo/commit/1c2c62e9ee48bf442f4b63f5379517b028633135) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Activate W&B Inference support for IBM Granite 4.2 8B with verified routing, pricing, and generated SDK model identifiers.

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
