# @phaseo/web

## 1.2.0

### Minor Changes

- [#1557](https://github.com/phaseoteam/Phaseo/pull/1557) [`da95013`](https://github.com/phaseoteam/Phaseo/commit/da9501340bcde7c9ad851f3e26e6c9848625f950) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add model pricing history, tier-aware effective pricing, and synchronized provider inspection.

- [#1314](https://github.com/phaseoteam/Phaseo/pull/1314) [`7a37f89`](https://github.com/phaseoteam/Phaseo/commit/7a37f8956c26affcaa792ecfbac445bf0c90f218) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add key-scoped dynamic routing flows, searchable model selection with ordered model and provider fallbacks, provider-health suggestions, and 15-minute cache-aware plus session-aware provider affinity.

### Patch Changes

- [#1729](https://github.com/phaseoteam/Phaseo/pull/1729) [`8667fee`](https://github.com/phaseoteam/Phaseo/commit/8667feef9f2bdea5de534666352c6cc26f2af2cc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an SEO-focused OpenRouter migration guide with agent instructions, validation steps, and free migration support.

- [#1656](https://github.com/phaseoteam/Phaseo/pull/1656) [`933df4c`](https://github.com/phaseoteam/Phaseo/commit/933df4ce3dd63a93a55a88b50623cab5441f09a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral OCR 4.1 with active gateway routing and verified standard and Batch API pricing.

- [#1266](https://github.com/phaseoteam/Phaseo/pull/1266) [`0674f8b`](https://github.com/phaseoteam/Phaseo/commit/0674f8b85f05f707a423d69c1e368be9b020cafc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit previous, next, and family navigation to model About sections, attach model licence sources directly to licence metadata, modernise dedicated family pages with recent-first ordering, consolidate codename variants into their canonical generation families, and enforce model lineage integrity during catalog validation.

- [#1299](https://github.com/phaseoteam/Phaseo/pull/1299) [`b8c68b2`](https://github.com/phaseoteam/Phaseo/commit/b8c68b2e65bc6ed4be6cfae14e65a80cd852e1c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Increase the monthly BYOK allowance to one million requests and reduce the service fee after the allowance to 2.5%.

- [#1736](https://github.com/phaseoteam/Phaseo/pull/1736) [`2192bd0`](https://github.com/phaseoteam/Phaseo/commit/2192bd0bd0c0fa7abaa780a47e3f5fbfd639a105) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align non-text chat rooms with consistent generating states, response timestamps, and optimistic prompt handling.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record normalized request client attribution, declare official SDK identities, and show request sources in workspace usage logs.

- [#1286](https://github.com/phaseoteam/Phaseo/pull/1286) [`7be11cd`](https://github.com/phaseoteam/Phaseo/commit/7be11cd461a2cb5243c8e5c3db376cdee879a113) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit discounted data contribution with up to 100% redacted prompt/response retention, independently sampled upstream classification, private R2 storage, persistent task rollups, audited consent controls, and matching CLI and web management surfaces. The feature ships fail-closed behind an admin-only Statsig preview gate. Failed, incomplete, and empty upstream generations are not billed.

- [#1484](https://github.com/phaseoteam/Phaseo/pull/1484) [`6a6e243`](https://github.com/phaseoteam/Phaseo/commit/6a6e24367329cc959dd21939855f38439edaa9aa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent cross-site cookie sessions from being upgraded to bearer credentials by the web proxy, and require explicit persistence for workspace selection.

- [#1499](https://github.com/phaseoteam/Phaseo/pull/1499) [`c8b8032`](https://github.com/phaseoteam/Phaseo/commit/c8b8032c64a412b47daa4debd25db0be2750fb12) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Display provider duration in readable seconds or minutes, record ITL from observed provider stream cadence, and chart cached input percentage by provider over time.

- [#1529](https://github.com/phaseoteam/Phaseo/pull/1529) [`ecfc043`](https://github.com/phaseoteam/Phaseo/commit/ecfc04377cbaf19285e3747368dccb6240d875e8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a public image and audio provenance checker backed by OpenAI, surface verification guidance on relevant model pages, and reorganise the public tools collection.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add inherited provider and route geographic availability policies, request-origin country and subdivision enforcement, published upstream restrictions for OpenAI, Anthropic, Gemini API, ElevenLabs, Z.AI, and LongCat, fallback diagnostics, and a dedicated unavailable-region API response. Require users to confirm their location and acknowledge the displayed restrictions before purchasing credits, serve the creator-branded model preview through a short-lived edge-cached web API projection, and collect full billing addresses for new-card checkouts.

- [#1725](https://github.com/phaseoteam/Phaseo/pull/1725) [`b54fc93`](https://github.com/phaseoteam/Phaseo/commit/b54fc93129a30d7f5145a81d20f453d70432471a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix unwanted settings page overflow and use consistent horizontal scroll areas across usage log tables.

- [#1459](https://github.com/phaseoteam/Phaseo/pull/1459) [`ebdb856`](https://github.com/phaseoteam/Phaseo/commit/ebdb856688b1fae92b54f26fed1f719d34e93370) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Thinking Orb activity indicators to chat and introduce an acknowledgements page for the open-source projects and design work behind Phaseo.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep Phaseo Chat in App attribution and enforce an exhaustive Source taxonomy for Direct HTTP, SDKs, agent SDKs, coding agents, and recognized HTTP clients.

- [#1488](https://github.com/phaseoteam/Phaseo/pull/1488) [`884620f`](https://github.com/phaseoteam/Phaseo/commit/884620fb27d03addda84aa76d67d8752b67d255f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the AI SDK provider Node requirement with AI SDK 7, harden malformed catalogue 404 paths, and correct catalogue manifest and importer-state validation gaps.

- [#1386](https://github.com/phaseoteam/Phaseo/pull/1386) [`6844207`](https://github.com/phaseoteam/Phaseo/commit/6844207e1d784289fb85150bca0b7557fec248e6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the complete official DeepSeek V4 Flash 0731 agent benchmark set and expose the newly catalogued benchmark identifiers through the API and generated SDKs.

- [#1379](https://github.com/phaseoteam/Phaseo/pull/1379) [`cc07f80`](https://github.com/phaseoteam/Phaseo/commit/cc07f808d2bc79305ad06ba2d0a982ddb01d0379) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Model DeepSeek V4 Flash 0731 as a separate catalogue and callable model, preserve the original V4 Flash and its third-party deployments, and move only DeepSeek's current direct route and pricing to the 0731 revision.

- [#1373](https://github.com/phaseoteam/Phaseo/pull/1373) [`ae8874c`](https://github.com/phaseoteam/Phaseo/commit/ae8874cc0c9cba19c774b63aa15cb35d788dfa77) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route official DeepSeek V4 Flash requests through DeepSeek's native Responses API, keep V4 Pro on Chat Completions, refresh V4 Flash metadata and pricing verification, and retire the discontinued direct DeepSeek legacy aliases.

- [#1655](https://github.com/phaseoteam/Phaseo/pull/1655) [`9b40c6f`](https://github.com/phaseoteam/Phaseo/commit/9b40c6f502cc12c6258e2bcdf60b509494d53433) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Baseten as a provider for DeepSeek V4 Pro 0813 while preserving the previous V4 Pro route and pricing history.

- [#1748](https://github.com/phaseoteam/Phaseo/pull/1748) [`e4f3bc3`](https://github.com/phaseoteam/Phaseo/commit/e4f3bc3f11edd1acc5fa0b62b346402f7af5cadb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose provider lifecycle status on the public provider index and label external providers with the model-page status treatment.

- [#1768](https://github.com/phaseoteam/Phaseo/pull/1768) [`176468a`](https://github.com/phaseoteam/Phaseo/commit/176468a0c01787268c2147bde62faaf0f9590386) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce model-watcher noise and storage: disable Discord alerts for internal Phaseo pricing-rule edits by default, drop Kilo Gateway, NanoGPT, and Hugging Face Router from discovery registries, store compact per-model watch snapshots instead of raw provider payloads, persist only cross-run diff state in run summaries, report official pricing-page changes as added/removed price lines, and enrich the catalog exclusively from live provider fetches.

- [#1755](https://github.com/phaseoteam/Phaseo/pull/1755) [`daa1b56`](https://github.com/phaseoteam/Phaseo/commit/daa1b5606da7c1a67910542350d95e080c18e506) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider sidebar filters for BYOK availability, legal policy links, prompt training, and data retention.

- [#1732](https://github.com/phaseoteam/Phaseo/pull/1732) [`3a5549e`](https://github.com/phaseoteam/Phaseo/commit/3a5549e0fa0ba9e8d07d6721fc4aa509a5c07591) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Organize footer decision resources into a dedicated section and tighten mobile column spacing.

- [#1648](https://github.com/phaseoteam/Phaseo/pull/1648) [`949cb67`](https://github.com/phaseoteam/Phaseo/commit/949cb67df3675d0610b89f7e670abe7685aebcfd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare Gemini 3.7 Flash with the published Google Cloud SKU pricing matrix for Google AI Studio and Vertex AI, add cached video-token pricing support, and mark recent Gemini Flash models as closed weight.

- [#1721](https://github.com/phaseoteam/Phaseo/pull/1721) [`1559d64`](https://github.com/phaseoteam/Phaseo/commit/1559d6495adf3fa7e08f1ad1372e0c928ef465c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add optional user-defined app attribution while keeping SDK client identity separate from workspace apps.

- [#1731](https://github.com/phaseoteam/Phaseo/pull/1731) [`5208ad7`](https://github.com/phaseoteam/Phaseo/commit/5208ad75a02165d3c64b8013b1be46643ee99f1c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hide unsupported document, file, and action modalities from model catalogue filters.

- [#1487](https://github.com/phaseoteam/Phaseo/pull/1487) [`3b7bc28`](https://github.com/phaseoteam/Phaseo/commit/3b7bc285ad0bcf49638553b12eca3056cf9477df) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep private workspace search results out of persistent command-palette pins and remove legacy workspace pins from browser storage.

- [#1739](https://github.com/phaseoteam/Phaseo/pull/1739) [`2386165`](https://github.com/phaseoteam/Phaseo/commit/23861652aedfdb8e1100bfba01145d6d48a21c35) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a Providers page filter for inactive providers with no routable models.

- [#1728](https://github.com/phaseoteam/Phaseo/pull/1728) [`a10b097`](https://github.com/phaseoteam/Phaseo/commit/a10b0974ceea8d04a2a6bf38a1ebb8158976d902) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore unsent Chat prompts after authentication redirects.

- [#1720](https://github.com/phaseoteam/Phaseo/pull/1720) [`394f893`](https://github.com/phaseoteam/Phaseo/commit/394f89351773becb2adb3cf4e53aa6b3c68ceb6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep request-log details recoverable when historical fields are missing or loading fails, and attribute Phaseo Chat gateway requests to the Phaseo Chat app.

- [#1733](https://github.com/phaseoteam/Phaseo/pull/1733) [`83fbddf`](https://github.com/phaseoteam/Phaseo/commit/83fbddf9fe7fca0153b0b553e56dbe696344b849) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep model-card metadata and modality badges on horizontally scrollable lines without visible scrollbars.

- [#1616](https://github.com/phaseoteam/Phaseo/pull/1616) [`fb7df5e`](https://github.com/phaseoteam/Phaseo/commit/fb7df5ea84775c12b41a592a66c166a15159d63f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject oversized Stripe checkout webhook request bodies with HTTP 413.

- [#937](https://github.com/phaseoteam/Phaseo/pull/937) [`390a840`](https://github.com/phaseoteam/Phaseo/commit/390a8405b3c560fc2f3f4210e42bbb2e86b2430d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add BytePlus Seedream 5.0 Pro catalog, pricing, and gateway image generation/edit support.

- [#1651](https://github.com/phaseoteam/Phaseo/pull/1651) [`c03f9c6`](https://github.com/phaseoteam/Phaseo/commit/c03f9c659e8de088bf27a474f2872809d68b90ba) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forward DeepSeek V4 Pro 0813 reasoning efforts and show recurring time-window pricing changes in model history charts.

- [#1777](https://github.com/phaseoteam/Phaseo/pull/1777) [`4c82fc8`](https://github.com/phaseoteam/Phaseo/commit/4c82fc8e544dc3c75a97ce28e7243bd90629f099) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show active promotional pricing as discounts, including promotions without a fixed end date.

- [#1730](https://github.com/phaseoteam/Phaseo/pull/1730) [`b7fb6a1`](https://github.com/phaseoteam/Phaseo/commit/b7fb6a1faa315a68ed4b39a230711c0ae3cbc613) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove redundant OpenRouter-specific links from the global footer navigation.

- [#1489](https://github.com/phaseoteam/Phaseo/pull/1489) [`5f2183d`](https://github.com/phaseoteam/Phaseo/commit/5f2183d99d262baedab7b7e9e4902c0598342571) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve model performance filters on smaller screens, clarify empty chart states, add detailed chart tooltips, and give every percentile series a distinct colour.

- [#1751](https://github.com/phaseoteam/Phaseo/pull/1751) [`8dd51b8`](https://github.com/phaseoteam/Phaseo/commit/8dd51b82a33e14a7e4b78365a7aebba6bbc0cd71) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the provider-count header line and preserve 4:3 flag proportions in the Headquarters filter.

- [#1758](https://github.com/phaseoteam/Phaseo/pull/1758) [`06ba3d1`](https://github.com/phaseoteam/Phaseo/commit/06ba3d15134ab82dba4e275cdf52ea4cb9418273) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider datacenter filtering and align the Providers table controls with the Models page.

- [#1724](https://github.com/phaseoteam/Phaseo/pull/1724) [`16032a6`](https://github.com/phaseoteam/Phaseo/commit/16032a66724c7225ead621e7aee79e5c6a1607f7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve usage-log inspection with layered side sheets, session headline details, request navigation, generation lookup, and contextual row actions.

## 1.1.0

### Minor Changes

- [#1172](https://github.com/phaseoteam/Phaseo/pull/1172) [`506bd06`](https://github.com/phaseoteam/Phaseo/commit/506bd066513418f19dd4c20b73b98637f035742b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose the asynchronous video API and playground behind coordinated, fail-closed rollout gates while preserving access to already accepted jobs.

### Patch Changes

- [#1021](https://github.com/phaseoteam/Phaseo/pull/1021) [`4f48229`](https://github.com/phaseoteam/Phaseo/commit/4f482299cc1db375ce04827c2e2fb0ed70f66c53) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an admin-gated passkey rollout and harden MFA sign-in, enrollment, session refresh, and account-management flows.

- [#966](https://github.com/phaseoteam/Phaseo/pull/966) [`482968d`](https://github.com/phaseoteam/Phaseo/commit/482968d7d66408b0af1c7683176db8a65a1e4601) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Gate PostHog and Google Analytics collection behind explicit analytics consent and add privacy-safe product milestone events for signup, onboarding, API keys, and credit purchases.

- [#1023](https://github.com/phaseoteam/Phaseo/pull/1023) [`703ca96`](https://github.com/phaseoteam/Phaseo/commit/703ca96f835deaac0b6c277b12cb8be84ec0e73f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Collapse the desktop settings sidebar to an accessible icon rail with navigation tooltips and an explicit expand control.

- [#1192](https://github.com/phaseoteam/Phaseo/pull/1192) [`a385a4b`](https://github.com/phaseoteam/Phaseo/commit/a385a4b93862b964964e099ee105c96cb7c0a279) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Import provider data-policy metadata into the public provider records used by the model catalogue.

- [#794](https://github.com/phaseoteam/Phaseo/pull/794) [`114713d`](https://github.com/phaseoteam/Phaseo/commit/114713dadf93fe7e722f08f9b31a21324d01daf5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Fireworks model discovery and catalog data to use the serverless-only models feed.

  This updates scheduled discovery to read the serverless Fireworks models route, handle paginated responses, and ignore any non-serverless rows defensively. It also refreshes the Fireworks catalog and pricing data to match the current live serverless inventory.

- [#1190](https://github.com/phaseoteam/Phaseo/pull/1190) [`b369191`](https://github.com/phaseoteam/Phaseo/commit/b369191ad0de6de2ec4850c558b06f2ee72fdbee) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route Gemini 3.6 Flash and Gemini 3.5 Flash-Lite through Google's current Interactions request shape, reject zero-output provider responses for failover, and show a structured error instead of persisting blank chat messages.

- [#948](https://github.com/phaseoteam/Phaseo/pull/948) [`c420a38`](https://github.com/phaseoteam/Phaseo/commit/c420a389be727d45daa13713658cd341081a5d3b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add GPT-5.6 Luna Pro, Sol Pro, and Terra Pro model IDs, routing them to OpenAI with `reasoning.mode=pro` while preserving separate public slugs.

- [#1032](https://github.com/phaseoteam/Phaseo/pull/1032) [`c8cd44c`](https://github.com/phaseoteam/Phaseo/commit/c8cd44cfcc7d6d48eb608dc19635266526a72468) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require explicit gateway consent before third-party OAuth can mint or use a user-funded delegated key, revoke previously issued low-scope keys, make the inference permission clear in the consent and client-management interfaces, and align refresh-token locking with immediate workspace revocation.

  Harden CLI OAuth token validation, local credential storage, Windows authorization URL launching, one-time OAuth client secret output, and backwards-compatible key-cache invalidation during the Phaseo environment-variable transition.

- [#1120](https://github.com/phaseoteam/Phaseo/pull/1120) [`b74b0da`](https://github.com/phaseoteam/Phaseo/commit/b74b0da67485853fc3dcc1f0152422da81b15221) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make time-windowed provider billing use the successful upstream fetch timestamp, persist the exact billing timestamp in pricing lines, avoid request-start fallback when authoritative timing is missing, and expire cached price cards at effective-date boundaries. Prepare DeepSeek V4 pricing rules to use upstream-send timing once official time windows become active. Show the currently active time-window rate in model provider tables and place it ahead of alternate period pricing in provider sheets.

- [#799](https://github.com/phaseoteam/Phaseo/pull/799) [`7d8ee28`](https://github.com/phaseoteam/Phaseo/commit/7d8ee28f7f6bef548111be15caa4de7bcc2c8147) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hook up the Meituan LongCat provider in scheduled model discovery and catalog data.

  This adds LongCat to the API model watcher, accepts the existing `MEITUAN_API_KEY` env alias in the API layer, and adds LongCat provider mapping and pricing data for `meituan/longcat-2.0-preview`.

- [#972](https://github.com/phaseoteam/Phaseo/pull/972) [`75a2493`](https://github.com/phaseoteam/Phaseo/commit/75a2493decb405a29a1fa29348ce8d6da3d601de) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden CLI OAuth sessions, key-pepper rotation, redirect handling, and abuse controls while moving the CLI to `api.phaseo.app`.

  Add filtered, workspace-scoped, redacted request log listing and per-request inspection to the Phaseo CLI.

- [#1042](https://github.com/phaseoteam/Phaseo/pull/1042) [`9e3749b`](https://github.com/phaseoteam/Phaseo/commit/9e3749bfdd06b2d10278787f7c0cfa67cfa4a56a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden OAuth and gateway-adjacent data access, webhook SSRF validation, error serialization, local credential handling, dependency security, and database RPC permissions following a repository-wide security audit.

- [#1018](https://github.com/phaseoteam/Phaseo/pull/1018) [`37656d9`](https://github.com/phaseoteam/Phaseo/commit/37656d9705173422b4a8e788134827989721c657) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Normalize the configured Gateway API URL to the versioned `/v1` base before publishing discovery and health endpoint metadata.

- [#1015](https://github.com/phaseoteam/Phaseo/pull/1015) [`8144b6c`](https://github.com/phaseoteam/Phaseo/commit/8144b6c7a9f4436345fb25c90de409b801007153) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Unify Amazon Bedrock on the Bedrock Mantle OpenAI-compatible provider, remove the Converse adapter path, and add GPT-5.6 Sol, Terra, and Luna catalog coverage.

- [#1123](https://github.com/phaseoteam/Phaseo/pull/1123) [`8209df0`](https://github.com/phaseoteam/Phaseo/commit/8209df0ed6a72ecf06fddb1f5fa029d73b6b7a20) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Unify and harden Phaseo OAuth discovery, consent, identity, revocation, PKCE, protected-resource binding, and confidential MCP-to-API token exchange across the first-party CLI, user-created applications, and dynamically registered MCP clients.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the web app, docs, and AI SDK provider with the coordinated major release.

  This captures breaking/structural updates tied to the gateway and SDK overhaul,
  including endpoint surface changes and updated integration expectations.

## 0.1.2

### Patch Changes

- [#6](https://github.com/phaseoteam/Phaseo/pull/6) [`4322886`](https://github.com/phaseoteam/Phaseo/commit/4322886327dde92030846969718c9131a2a30431) Thanks [@DanielButler1](https://github.com/DanielButler1)! - New Feature: Dark Mode!

## 0.1.1

### Patch Changes

- [`d322b30`](https://github.com/phaseoteam/Phaseo/commit/d322b30bbe33cde56ca80f17c5612c4609d58f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix minor issues with links, update country pages and add dynamic OG images
