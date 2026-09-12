# @phaseo/web

## 1.2.0

### Minor Changes

- [#1807](https://github.com/phaseoteam/Phaseo/pull/1807) [`f632028`](https://github.com/phaseoteam/Phaseo/commit/f63202845b98c90cec966daf8e9192043727e983) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Rename organisation pages to Labs, enrich their model cards, and add model-aligned performance and link sections.

- [#1557](https://github.com/phaseoteam/Phaseo/pull/1557) [`da95013`](https://github.com/phaseoteam/Phaseo/commit/da9501340bcde7c9ad851f3e26e6c9848625f950) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add model pricing history, tier-aware effective pricing, and synchronized provider inspection.

- [#1314](https://github.com/phaseoteam/Phaseo/pull/1314) [`7a37f89`](https://github.com/phaseoteam/Phaseo/commit/7a37f8956c26affcaa792ecfbac445bf0c90f218) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add key-scoped dynamic routing flows, searchable model selection with ordered model and provider fallbacks, provider-health suggestions, and 15-minute cache-aware plus session-aware provider affinity.

- [#1754](https://github.com/phaseoteam/Phaseo/pull/1754) [`cbaf35c`](https://github.com/phaseoteam/Phaseo/commit/cbaf35cc86f7acccc6380620f9f95f9d95d8d0c8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add self-serve Enterprise subscriptions with SSO, SCIM provisioning, workspace directory management, and member-based billing.

- [#2338](https://github.com/phaseoteam/Phaseo/pull/2338) [`fdb2816`](https://github.com/phaseoteam/Phaseo/commit/fdb2816c95710fcba066908aca9021625d645367) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add GPT Live 1 to the Realtime playground with dedicated Live session APIs, all built-in voices, configurable Responses delegation and optional web search. Price voice duration, backend tokens/cache usage and native tool calls separately with snapshotted tier-aware prices. Preserve final usage across disconnects, retain holds when usage is incomplete, and show delegation usage and component costs.
  
  Verify microphone frames and resume capture/playback before opening a billable Live connection. Report first audio forwarding, microphone signal and provider audio, and stop disconnected or stalled capture. Include offline browser checks for the room's audio round trip, blocked permissions, autoplay and cleanup without paid provider calls.
  
  Show short, documented language, regional influence and presentation descriptions for 12 Live voices, with wrapping text in the voice selector.
  
  Keep the session overview scrollable above the call controls and present delegation usage in a keyboard-accessible, bounded disclosure panel, using ShadCN Scroll Area for both scrollable regions.
  
  Use ShadCN Scroll Area in the realtime/delegation settings dialog and keep the dialog within short mobile viewports.

### Patch Changes

- [#2055](https://github.com/phaseoteam/Phaseo/pull/2055) [`577ec42`](https://github.com/phaseoteam/Phaseo/commit/577ec42a1a73a46e54287c878f2ed948a48a682e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the Statsig-gated Alpha for the `phaseo/auto` model router with a separately metered low-cost classifier request, complexity-aware capability scoring, a managed text-model universe, workspace spend profiles and pattern restrictions, routing diagnostics, retryable model fallbacks, and a dedicated Auto Routing settings page.

- [#2297](https://github.com/phaseoteam/Phaseo/pull/2297) [`0c9c1aa`](https://github.com/phaseoteam/Phaseo/commit/0c9c1aa70c6bc526023576001eeab21737dfa1b0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add BYOK-only provider policy, BYOK-aware batch files and lifecycle operations, fee-only batch reservations and settlement, and model-page BYOK-only indicators.

- [#2281](https://github.com/phaseoteam/Phaseo/pull/2281) [`73fe9a1`](https://github.com/phaseoteam/Phaseo/commit/73fe9a1e6b3ecc8c11a9e6d67da8e61ca5bc6dda) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add ISO 3166-2 primary location metadata for catalogue organisations and API providers, including named-location display in the public catalogue and admin editing support.

- [#2262](https://github.com/phaseoteam/Phaseo/pull/2262) [`760d38c`](https://github.com/phaseoteam/Phaseo/commit/760d38c70b36522ab600c22e6929a69d0a4b7a9d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the CrofAI brand logo to provider and model surfaces.

- [#1729](https://github.com/phaseoteam/Phaseo/pull/1729) [`8667fee`](https://github.com/phaseoteam/Phaseo/commit/8667feef9f2bdea5de534666352c6cc26f2af2cc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an SEO-focused OpenRouter migration guide with agent instructions, validation steps, and free migration support.

- [#2117](https://github.com/phaseoteam/Phaseo/pull/2117) [`6eaf82e`](https://github.com/phaseoteam/Phaseo/commit/6eaf82e5981127d8d23822fe950f8b6520d97919) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add RunInfra as a catalogue API provider with its eight currently supported hosted models and verified text-generation pricing.

- [#2029](https://github.com/phaseoteam/Phaseo/pull/2029) [`ebfc0ee`](https://github.com/phaseoteam/Phaseo/commit/ebfc0ee29f29f7ea0062ad34b3623bd30b47758e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Register Tencent Cloud TokenHub as an OpenAI-compatible text provider with the current international model scope, capture USD pricing, and expose its API-key onboarding metadata. Exclude vendor-direct, Kinfra, and media routes; keep the scoped routes disabled pending live API-key smoke testing.

- [#1796](https://github.com/phaseoteam/Phaseo/pull/1796) [`ed53721`](https://github.com/phaseoteam/Phaseo/commit/ed537215181130cdc164c6c1a9c906aca39549bc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace notification settings with encrypted Email, Discord, Slack, Microsoft Teams, and custom webhook destinations, synchronous connection tests, mentions, retries, and model deprecation alerts.

- [#2216](https://github.com/phaseoteam/Phaseo/pull/2216) [`18939f5`](https://github.com/phaseoteam/Phaseo/commit/18939f558b73f2d6e383c8614f8a5e64596ae210) Thanks [@DanielButler1](https://github.com/DanielButler1)! - List Video and Batch as invite-only Feature Previews with gate-based availability and links to the beta documentation and job logs.

- [#2050](https://github.com/phaseoteam/Phaseo/pull/2050) [`f519fd6`](https://github.com/phaseoteam/Phaseo/commit/f519fd6224c5de39bd2e93dc0ce1f07e664c1a3b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Support dropping files onto the Chat composer, including HEIC and AVIF images whose MIME type is missing or reported generically by the browser.

- [#1968](https://github.com/phaseoteam/Phaseo/pull/1968) [`ee21942`](https://github.com/phaseoteam/Phaseo/commit/ee219420268a1e92caaee2192c61f9d6b9f87d83) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add independent light and dark logo previews to the brand menu.

- [#2280](https://github.com/phaseoteam/Phaseo/pull/2280) [`0a7d732`](https://github.com/phaseoteam/Phaseo/commit/0a7d73266c2dbc1f0dde0ddd5077ae09626a9460) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Let model pages switch between Artificial Analysis configurations and compare index results inline.

- [#1656](https://github.com/phaseoteam/Phaseo/pull/1656) [`933df4c`](https://github.com/phaseoteam/Phaseo/commit/933df4ce3dd63a93a55a88b50623cab5441f09a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral OCR 4.1 with active gateway routing and verified standard and Batch API pricing.

- [#2264](https://github.com/phaseoteam/Phaseo/pull/2264) [`6b955c0`](https://github.com/phaseoteam/Phaseo/commit/6b955c0b9aa947ff451c2076103c92d7ef7865db) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Feature Artificial Analysis Intelligence, Coding, Agentic and evaluation cost across model pages, the benchmark directory, detail pages, and rankings. Add searchable results, explicit index versions, official attribution, and a daily catalog sync with configurable source-model mappings. Preserve other benchmark results and rank evaluation cost lower-first.

- [#1266](https://github.com/phaseoteam/Phaseo/pull/1266) [`0674f8b`](https://github.com/phaseoteam/Phaseo/commit/0674f8b85f05f707a423d69c1e368be9b020cafc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit previous, next, and family navigation to model About sections, attach model licence sources directly to licence metadata, modernise dedicated family pages with recent-first ordering, consolidate codename variants into their canonical generation families, and enforce model lineage integrity during catalog validation.

- [#1889](https://github.com/phaseoteam/Phaseo/pull/1889) [`4724cdf`](https://github.com/phaseoteam/Phaseo/commit/4724cdfbe84481f22e563bdc4e088b3dbbaa05cd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Complete the STACKIT shared-model catalogue with verified EU01 availability, limits, exact provider identifiers, and EUR pricing.

- [#2257](https://github.com/phaseoteam/Phaseo/pull/2257) [`376cb01`](https://github.com/phaseoteam/Phaseo/commit/376cb011bd12bf7d63ec4d621d1e1ad365afd122) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redesign async webhook settings with a guided endpoint editor, friendly event subscriptions, endpoint ID handoff, secret rotation safeguards, and validated endpoint updates.

- [#1299](https://github.com/phaseoteam/Phaseo/pull/1299) [`b8c68b2`](https://github.com/phaseoteam/Phaseo/commit/b8c68b2e65bc6ed4be6cfae14e65a80cd852e1c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Increase the monthly BYOK allowance to one million requests and reduce the service fee after the allowance to 2.5%.

- [#1736](https://github.com/phaseoteam/Phaseo/pull/1736) [`2192bd0`](https://github.com/phaseoteam/Phaseo/commit/2192bd0bd0c0fa7abaa780a47e3f5fbfd639a105) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align non-text chat rooms with consistent generating states, response timestamps, and optimistic prompt handling.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record normalized request client attribution, declare official SDK identities, and show request sources in workspace usage logs.

- [#1286](https://github.com/phaseoteam/Phaseo/pull/1286) [`7be11cd`](https://github.com/phaseoteam/Phaseo/commit/7be11cd461a2cb5243c8e5c3db376cdee879a113) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit discounted data contribution with up to 100% redacted prompt/response retention, independently sampled upstream classification, private R2 storage, persistent task rollups, audited consent controls, and matching CLI and web management surfaces. The feature ships fail-closed behind an admin-only Statsig preview gate. Failed, incomplete, and empty upstream generations are not billed.

- [#1484](https://github.com/phaseoteam/Phaseo/pull/1484) [`6a6e243`](https://github.com/phaseoteam/Phaseo/commit/6a6e24367329cc959dd21939855f38439edaa9aa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent cross-site cookie sessions from being upgraded to bearer credentials by the web proxy, and require explicit persistence for workspace selection.

- [#1499](https://github.com/phaseoteam/Phaseo/pull/1499) [`c8b8032`](https://github.com/phaseoteam/Phaseo/commit/c8b8032c64a412b47daa4debd25db0be2750fb12) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Display provider duration in readable seconds or minutes, record ITL from observed provider stream cadence, and chart cached input percentage by provider over time.

- [#2090](https://github.com/phaseoteam/Phaseo/pull/2090) [`649dc00`](https://github.com/phaseoteam/Phaseo/commit/649dc00ee648c17349807a2c77628b7c66f55537) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show model performance as hourly provider trends over seven days, validate tool calls and structured responses by failure reason, calculate cache reuse from cached-read and input tokens, surface ordinary performance and uptime observations from the first request, and compact the model uptime presentation. Cache-derived metrics retain their larger telemetry threshold.

- [#1529](https://github.com/phaseoteam/Phaseo/pull/1529) [`ecfc043`](https://github.com/phaseoteam/Phaseo/commit/ecfc04377cbaf19285e3747368dccb6240d875e8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a public image and audio provenance checker backed by OpenAI, surface verification guidance on relevant model pages, and reorganise the public tools collection.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add inherited provider and route geographic availability policies, request-origin country and subdivision enforcement, published upstream restrictions for OpenAI, Anthropic, Gemini API, ElevenLabs, Z.AI, and LongCat, fallback diagnostics, and a dedicated unavailable-region API response. Require users to confirm their location and acknowledge the displayed restrictions before purchasing credits, serve the creator-branded model preview through a short-lived edge-cached web API projection, and collect full billing addresses for new-card checkouts.

- [#1725](https://github.com/phaseoteam/Phaseo/pull/1725) [`b54fc93`](https://github.com/phaseoteam/Phaseo/commit/b54fc93129a30d7f5145a81d20f453d70432471a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix unwanted settings page overflow and use consistent horizontal scroll areas across usage log tables.

- [#2315](https://github.com/phaseoteam/Phaseo/pull/2315) [`711adc6`](https://github.com/phaseoteam/Phaseo/commit/711adc6fda54907123ca0c9353752b79364fa532) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Link public catalog correction buttons to prefilled GitHub issues and document database-backed catalog contributions.

- [#2341](https://github.com/phaseoteam/Phaseo/pull/2341) [`958c322`](https://github.com/phaseoteam/Phaseo/commit/958c322ed2e932c49f2d96c57c1d5e7d090fcd36) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show cache rates by provider in model performance charts and use percentile bands for single-provider models.

- [#1459](https://github.com/phaseoteam/Phaseo/pull/1459) [`ebdb856`](https://github.com/phaseoteam/Phaseo/commit/ebdb856688b1fae92b54f26fed1f719d34e93370) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Thinking Orb activity indicators to chat and introduce an acknowledgements page for the open-source projects and design work behind Phaseo.

- [#2079](https://github.com/phaseoteam/Phaseo/pull/2079) [`def2b18`](https://github.com/phaseoteam/Phaseo/commit/def2b187ceca2dbb0530a2ae0062cfa9f8b5df2b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Clarify documented, partial, and unknown parameter support in provider sheets.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep Phaseo Chat in App attribution and enforce an exhaustive Source taxonomy for Direct HTTP, SDKs, agent SDKs, coding agents, and recognized HTTP clients.

- [#1488](https://github.com/phaseoteam/Phaseo/pull/1488) [`884620f`](https://github.com/phaseoteam/Phaseo/commit/884620fb27d03addda84aa76d67d8752b67d255f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the AI SDK provider Node requirement with AI SDK 7, harden malformed catalogue 404 paths, and correct catalogue manifest and importer-state validation gaps.

- [#2100](https://github.com/phaseoteam/Phaseo/pull/2100) [`7bf8a09`](https://github.com/phaseoteam/Phaseo/commit/7bf8a09b3ccddd37e4f78a2a4514743a32205e02) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show actionable, status-specific recovery guidance for failed Chat requests.

- [#2318](https://github.com/phaseoteam/Phaseo/pull/2318) [`ceafdab`](https://github.com/phaseoteam/Phaseo/commit/ceafdab7a3e708ad644233cacac9e2afb827e4c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve pricing history tooltips and connect pricing table row hover to the matching chart series.

- [#1954](https://github.com/phaseoteam/Phaseo/pull/1954) [`f6c9ea0`](https://github.com/phaseoteam/Phaseo/commit/f6c9ea0d9dd99a6c2c7412b90060e2f281d1c564) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Simplify public provider privacy metadata into Data Policy, ZDR, and location fields, while exposing the canonical policy metadata in model pricing responses.

- [#2057](https://github.com/phaseoteam/Phaseo/pull/2057) [`f3bc535`](https://github.com/phaseoteam/Phaseo/commit/f3bc535bdd1a04df05ba1ada2220526fbd5da9e3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep model discovery limited to routable Gateway models by default and clarify catalog, telemetry-window, status, and reliability claims across the public site and documentation.

- [#2260](https://github.com/phaseoteam/Phaseo/pull/2260) [`c9d8d34`](https://github.com/phaseoteam/Phaseo/commit/c9d8d3482e94f8b6b191faf75d4943260c6d1bfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make dynamic routing a compact workspace with a viewport-sized flow editor and searchable API key selection.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Complete database-backed catalog management with registry editors and a reviewed provider pricing queue. Retire JSON imports, sync benchmarks directly to the database, and generate catalog enums from daily public database exports.

- [#2331](https://github.com/phaseoteam/Phaseo/pull/2331) [`224de9f`](https://github.com/phaseoteam/Phaseo/commit/224de9feb623c4e9877f47e71df6e603fc10a7d5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh both the Worker data cache and the website page cache from the developer menu, then reload the page to discard stale section state. Include effective pricing in model and catalogue purges, and make browser requests for model sections recheck the shared cache.

- [#1386](https://github.com/phaseoteam/Phaseo/pull/1386) [`6844207`](https://github.com/phaseoteam/Phaseo/commit/6844207e1d784289fb85150bca0b7557fec248e6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the complete official DeepSeek V4 Flash 0731 agent benchmark set and expose the newly catalogued benchmark identifiers through the API and generated SDKs.

- [#1379](https://github.com/phaseoteam/Phaseo/pull/1379) [`cc07f80`](https://github.com/phaseoteam/Phaseo/commit/cc07f808d2bc79305ad06ba2d0a982ddb01d0379) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Model DeepSeek V4 Flash 0731 as a separate catalogue and callable model, preserve the original V4 Flash and its third-party deployments, and move only DeepSeek's current direct route and pricing to the 0731 revision.

- [#1373](https://github.com/phaseoteam/Phaseo/pull/1373) [`ae8874c`](https://github.com/phaseoteam/Phaseo/commit/ae8874cc0c9cba19c774b63aa15cb35d788dfa77) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route official DeepSeek V4 Flash requests through DeepSeek's native Responses API, keep V4 Pro on Chat Completions, refresh V4 Flash metadata and pricing verification, and retire the discontinued direct DeepSeek legacy aliases.

- [#1974](https://github.com/phaseoteam/Phaseo/pull/1974) [`a45e0c4`](https://github.com/phaseoteam/Phaseo/commit/a45e0c46b08b2186765ac4f9de7589cd2c35de55) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Rank global search results purely by relevance while preserving newest-first model ordering for tied matches.

- [#2346](https://github.com/phaseoteam/Phaseo/pull/2346) [`23b6c5a`](https://github.com/phaseoteam/Phaseo/commit/23b6c5a40117bdbc1d6e0f5ff6590332f9552454) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh public model caches after catalogue edits, shorten mutable Cloudflare freshness windows, recheck catalogue and model pages when a tab resumes, and stream model detail sections after the overview. Make gateway model responses immediately revalidate in client caches. The manual model purge now expires the entire model route, while search uses a short Cloudflare cache and refetches directly on return instead of requiring a browser generation counter.

- [#2343](https://github.com/phaseoteam/Phaseo/pull/2343) [`1beb1e7`](https://github.com/phaseoteam/Phaseo/commit/1beb1e7e10b975cd4cdcf1f97e58d0633b4930c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Return aggregated cost totals needed for effective pricing, add performance fetches with 30-minute one-day, hourly three-day, and daily seven-day rollups, restore TTFT and end-to-end latency in daily provider trends, treat requests without reported cache usage as a zero cache rate, improve sparse charts, and evenly distribute model-section controls across mobile widths.

- [#2324](https://github.com/phaseoteam/Phaseo/pull/2324) [`c0ca8fc`](https://github.com/phaseoteam/Phaseo/commit/c0ca8fc97a07bb66ad8f8e1ca0ecc2c733e5389a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh model Open Graph and Twitter card images with balanced long-title wrapping, logo-aware spacing, anchored stats/footer layout, and Standard list pricing with promotion labels.

- [#2268](https://github.com/phaseoteam/Phaseo/pull/2268) [`47131a1`](https://github.com/phaseoteam/Phaseo/commit/47131a1167cf2fdbd328c15105943842457d0daf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent duplicate Phaseo branding in page titles and count distinct providers instead of route and capability records in model metadata.

- [#1655](https://github.com/phaseoteam/Phaseo/pull/1655) [`9b40c6f`](https://github.com/phaseoteam/Phaseo/commit/9b40c6f502cc12c6258e2bcdf60b509494d53433) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Baseten as a provider for DeepSeek V4 Pro 0813 while preserving the previous V4 Pro route and pricing history.

- [#1748](https://github.com/phaseoteam/Phaseo/pull/1748) [`e4f3bc3`](https://github.com/phaseoteam/Phaseo/commit/e4f3bc3f11edd1acc5fa0b62b346402f7af5cadb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose provider lifecycle status on the public provider index and label external providers with the model-page status treatment.

- [#2216](https://github.com/phaseoteam/Phaseo/pull/2216) [`18939f5`](https://github.com/phaseoteam/Phaseo/commit/18939f558b73f2d6e383c8614f8a5e64596ae210) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden asynchronous video settlement and terminal webhook recovery, preserve batch pricing conditions, and add scoped video provider options and explicit frame inputs. Align AtlasCloud Seedance mappings and expose LTX status and content recovery.
  
  Journal video submissions across adapters, retain holds on uncertain outcomes, validate and enable MiniMax H3 Max after native lifecycle checks, and flag unexpected zero-cost completion of paid jobs. Persist webhook attempts before releasing delivery claims and expose provider submission state in job logs.
  
  Correct MiniMax V1 resolution validation and Google REST video requests, isolate provider identity during content retrieval, recheck webhook state after claiming delivery, and preserve terminal completion timestamps on repeated reads.

- [#1930](https://github.com/phaseoteam/Phaseo/pull/1930) [`ec92a10`](https://github.com/phaseoteam/Phaseo/commit/ec92a1013fb4072d25e0b072cf446bf2319395a9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Canonicalize model slugs when importing model links, details, and page notices so aliased canonical ids no longer produce orphaned child rows that violate foreign keys during import.

- [#2091](https://github.com/phaseoteam/Phaseo/pull/2091) [`1e0b959`](https://github.com/phaseoteam/Phaseo/commit/1e0b959a4f11767a97c581d1d907af36ad904637) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align homepage model prices with the lowest active standard route available through the Phaseo gateway.

- [#2160](https://github.com/phaseoteam/Phaseo/pull/2160) [`c029f44`](https://github.com/phaseoteam/Phaseo/commit/c029f4455b3a2d0fff6948544cbd9108095ed234) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Migrate shared class-name merging from clsx and tailwind-merge to cn.

- [#2095](https://github.com/phaseoteam/Phaseo/pull/2095) [`3df7fc9`](https://github.com/phaseoteam/Phaseo/commit/3df7fc997253b1395e7d00e1a5bb4c104bc5c3e3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add shareable provider inspector URL state to model pages.

- [#1768](https://github.com/phaseoteam/Phaseo/pull/1768) [`176468a`](https://github.com/phaseoteam/Phaseo/commit/176468a0c01787268c2147bde62faaf0f9590386) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reduce model-watcher noise and storage: disable Discord alerts for internal Phaseo pricing-rule edits by default, drop Kilo Gateway, NanoGPT, and Hugging Face Router from discovery registries, store compact per-model watch snapshots instead of raw provider payloads, persist only cross-run diff state in run summaries, report official pricing-page changes as added/removed price lines, and enrich the catalog exclusively from live provider fetches.

- [#2299](https://github.com/phaseoteam/Phaseo/pull/2299) [`d6df87f`](https://github.com/phaseoteam/Phaseo/commit/d6df87ff81adae912b5551848ff1446fe1c08961) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Revalidate the models catalogue when a stale browser tab becomes active again, while preserving the selected filters and sorting.

- [#2270](https://github.com/phaseoteam/Phaseo/pull/2270) [`aeadbd1`](https://github.com/phaseoteam/Phaseo/commit/aeadbd1e5fc584cdfb401377510645c48d9bd6f8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh country and subscription plan pages with consistent corners, shared UI components, and Lucide icons.

- [#1755](https://github.com/phaseoteam/Phaseo/pull/1755) [`daa1b56`](https://github.com/phaseoteam/Phaseo/commit/daa1b5606da7c1a67910542350d95e080c18e506) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider sidebar filters for BYOK availability, legal policy links, prompt training, and data retention.

- [#1732](https://github.com/phaseoteam/Phaseo/pull/1732) [`3a5549e`](https://github.com/phaseoteam/Phaseo/commit/3a5549e0fa0ba9e8d07d6721fc4aa509a5c07591) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Organize footer decision resources into a dedicated section and tighten mobile column spacing.

- [#2220](https://github.com/phaseoteam/Phaseo/pull/2220) [`368318f`](https://github.com/phaseoteam/Phaseo/commit/368318f96ef2d28f80c42997e0037f75ba8658e5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject malformed pricing units, unsupported currencies, unsafe debit amounts and incomplete priced subtotals. Preserve reference-input charges for per-clip video pricing and correct stable Vertex Veo rates to bill output seconds.
  
  Retire obsolete catalog-owned billing meters when a SKU's billing unit changes, preserving historical meter references and protected pricing overrides.
  
  Preserve LTX audio-to-video billing during terminal status/content reads and exclude retired meters from public pricing projections.

- [#2004](https://github.com/phaseoteam/Phaseo/pull/2004) [`e877553`](https://github.com/phaseoteam/Phaseo/commit/e877553e68bb1477d071cf2b56cf2db8d131d7cf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Protect database-owned stealth routes from catalogue reconciliation and expose their provider identity as `stealth` across public model and pricing surfaces.

- [#1648](https://github.com/phaseoteam/Phaseo/pull/1648) [`949cb67`](https://github.com/phaseoteam/Phaseo/commit/949cb67df3675d0610b89f7e670abe7685aebcfd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare Gemini 3.7 Flash with the published Google Cloud SKU pricing matrix for Google AI Studio and Vertex AI, add cached video-token pricing support, and mark recent Gemini Flash models as closed weight.

- [#1721](https://github.com/phaseoteam/Phaseo/pull/1721) [`1559d64`](https://github.com/phaseoteam/Phaseo/commit/1559d6495adf3fa7e08f1ad1372e0c928ef465c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add optional user-defined app attribution while keeping SDK client identity separate from workspace apps.

- [#1731](https://github.com/phaseoteam/Phaseo/pull/1731) [`5208ad7`](https://github.com/phaseoteam/Phaseo/commit/5208ad75a02165d3c64b8013b1be46643ee99f1c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Hide unsupported document, file, and action modalities from model catalogue filters.

- [#1487](https://github.com/phaseoteam/Phaseo/pull/1487) [`3b7bc28`](https://github.com/phaseoteam/Phaseo/commit/3b7bc285ad0bcf49638553b12eca3056cf9477df) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep private workspace search results out of persistent command-palette pins and remove legacy workspace pins from browser storage.

- [#1739](https://github.com/phaseoteam/Phaseo/pull/1739) [`2386165`](https://github.com/phaseoteam/Phaseo/commit/23861652aedfdb8e1100bfba01145d6d48a21c35) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a Providers page filter for inactive providers with no routable models.

- [#2256](https://github.com/phaseoteam/Phaseo/pull/2256) [`7867966`](https://github.com/phaseoteam/Phaseo/commit/7867966ca6bbb573b2930dab5d6cae5e37cee78c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use Stripe-hosted receipts for wallet credit purchases instead of presenting the action as an invoice download.

- [#2259](https://github.com/phaseoteam/Phaseo/pull/2259) [`ba2bbe7`](https://github.com/phaseoteam/Phaseo/commit/ba2bbe725a1c88a8c4a7262bfeb2a2b3c8286d94) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add settings sidebar filtering, expand global search page coverage and contextual suggestions, and show notification destination logos in dropdown options and selections.

- [#2340](https://github.com/phaseoteam/Phaseo/pull/2340) [`9c96fa7`](https://github.com/phaseoteam/Phaseo/commit/9c96fa760b456c62a16138654b1b5512580b024d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add an admin review queue for unresolved realtime billing with evidence-based capture, audited hold decisions, and separate access restoration.

- [#2227](https://github.com/phaseoteam/Phaseo/pull/2227) [`feb2404`](https://github.com/phaseoteam/Phaseo/commit/feb240478dba08ee271150f8ede65d41493ff54b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix Realtime Chat authentication and session setup, preserve cached-token billing across normalization, and show database-backed session holds and final charges in Chat and Realtime Sessions logs.
  
  Correct the current OpenAI Realtime price cards and refresh generated model suggestions to remove expired MiniMax free routes. Model request fields continue to accept arbitrary string IDs; this catalogue refresh does not remove request operations or change their wire format.

- [#2239](https://github.com/phaseoteam/Phaseo/pull/2239) [`d4e1284`](https://github.com/phaseoteam/Phaseo/commit/d4e1284a0920e738aca0a07bbcda6c7006bbef99) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Allow Phaseo to request microphone permission for Realtime and Chat audio recording. Previously the site-wide Permissions-Policy blocked capture before the browser could ask for consent. Camera and location access remain disabled, and microphone access remains restricted to the same origin.

- [#2242](https://github.com/phaseoteam/Phaseo/pull/2242) [`aae218a`](https://github.com/phaseoteam/Phaseo/commit/aae218a8b6ba2d7fcff1d6d119403c68e1aa37d2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable tested OpenAI Realtime 1.5, 2, 2.1 and 2.1 Mini, and Grok Voice Think Fast 2.0 for the gated Realtime preview. Use provider acknowledgements to settle OpenAI's uncommitted audio, preserve quiet speech, keep missing final usage unresolved, meter Grok PCM precisely, and correct model-specific cost estimates.

- [#2243](https://github.com/phaseoteam/Phaseo/pull/2243) [`09201e3`](https://github.com/phaseoteam/Phaseo/commit/09201e32b25ddbbc748645ab581f9a6ed8761026) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace realtime session cards with a compact usage table and a detail side sheet for billing, lifecycle, and usage.

- [#2241](https://github.com/phaseoteam/Phaseo/pull/2241) [`a0ebaae`](https://github.com/phaseoteam/Phaseo/commit/a0ebaaeb497c0ee7a820f5f915425f92eaa65894) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix Google Realtime silence handling and turn completion so completed conversations settle their usage and release unused holds. Authenticate Chat billing polling and distinguish estimates, final charges, and released credit in the session display.

- [#2099](https://github.com/phaseoteam/Phaseo/pull/2099) [`60a383f`](https://github.com/phaseoteam/Phaseo/commit/60a383f0061238b17c0f092ed8f49ddc1883507a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redirect legacy model subroutes to their canonical model pages.

- [#1728](https://github.com/phaseoteam/Phaseo/pull/1728) [`a10b097`](https://github.com/phaseoteam/Phaseo/commit/a10b0974ceea8d04a2a6bf38a1ebb8158976d902) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Restore unsent Chat prompts after authentication redirects.

- [#1720](https://github.com/phaseoteam/Phaseo/pull/1720) [`394f893`](https://github.com/phaseoteam/Phaseo/commit/394f89351773becb2adb3cf4e53aa6b3c68ceb6b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep request-log details recoverable when historical fields are missing or loading fails, and attribute Phaseo Chat gateway requests to the Phaseo Chat app.

- [#1830](https://github.com/phaseoteam/Phaseo/pull/1830) [`7626284`](https://github.com/phaseoteam/Phaseo/commit/7626284bedd85de7c5ad34e0792e384a17143fa5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Let workspace administrators choose notification destinations separately for each alert type.

- [#1881](https://github.com/phaseoteam/Phaseo/pull/1881) [`56aa0d4`](https://github.com/phaseoteam/Phaseo/commit/56aa0d46971aa75b88c0238dc77ee7cf0fba0161) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expand the Runway provider catalog across its current video, image, audio, upscaling, and real-time APIs, preserve retired model history, and add complete official credit pricing including per-frame video upscaling.

- [#1733](https://github.com/phaseoteam/Phaseo/pull/1733) [`83fbddf`](https://github.com/phaseoteam/Phaseo/commit/83fbddf9fe7fca0153b0b553e56dbe696344b849) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep model-card metadata and modality badges on horizontally scrollable lines without visible scrollbars.

- [#2328](https://github.com/phaseoteam/Phaseo/pull/2328) [`708d1b9`](https://github.com/phaseoteam/Phaseo/commit/708d1b9f488c77217554b31ee30e963db60fe9ac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden pricing, batch credentials and downloads, directory administration, telemetry privacy, public metadata, release tooling, and catalogue routing against the latest cloud security findings.

- [#1616](https://github.com/phaseoteam/Phaseo/pull/1616) [`fb7df5e`](https://github.com/phaseoteam/Phaseo/commit/fb7df5ea84775c12b41a592a66c166a15159d63f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject oversized Stripe checkout webhook request bodies with HTTP 413.

- [#937](https://github.com/phaseoteam/Phaseo/pull/937) [`390a840`](https://github.com/phaseoteam/Phaseo/commit/390a8405b3c560fc2f3f4210e42bbb2e86b2430d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add BytePlus Seedream 5.0 Pro catalog, pricing, and gateway image generation/edit support.

- [#1651](https://github.com/phaseoteam/Phaseo/pull/1651) [`c03f9c6`](https://github.com/phaseoteam/Phaseo/commit/c03f9c659e8de088bf27a474f2872809d68b90ba) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Forward DeepSeek V4 Pro 0813 reasoning efforts and show recurring time-window pricing changes in model history charts.

- [#2097](https://github.com/phaseoteam/Phaseo/pull/2097) [`f24db49`](https://github.com/phaseoteam/Phaseo/commit/f24db49d4ed8617f84493c34c3a80c4ae960cb22) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show workspace names instead of workspace IDs in the CLI activation selector.

- [#2303](https://github.com/phaseoteam/Phaseo/pull/2303) [`c5bbd5d`](https://github.com/phaseoteam/Phaseo/commit/c5bbd5dd9f2a203336380dff0d958e8c3f536291) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show BYOK-only status on model provider rows and add provider-key setup to Quickstart when no managed route is available.

- [#2196](https://github.com/phaseoteam/Phaseo/pull/2196) [`8f93b5b`](https://github.com/phaseoteam/Phaseo/commit/8f93b5be0558102e2a555573b81581b30671dda2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show mapped model providers and published pricing even before their Phaseo gateway route is active, including Astra's coming-soon OpenAI pricing. Attribute runtime health and performance to individual provider service tiers and sort each tier independently.

- [#1777](https://github.com/phaseoteam/Phaseo/pull/1777) [`4c82fc8`](https://github.com/phaseoteam/Phaseo/commit/4c82fc8e544dc3c75a97ce28e7243bd90629f099) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show active promotional pricing as discounts, including promotions without a fixed end date.

- [#2052](https://github.com/phaseoteam/Phaseo/pull/2052) [`3f5e095`](https://github.com/phaseoteam/Phaseo/commit/3f5e09520577af5a33705e9e68cf55be7f9abaa6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Show copyable provider-qualified model IDs and explain their routing behavior in provider details.

- [#1730](https://github.com/phaseoteam/Phaseo/pull/1730) [`b7fb6a1`](https://github.com/phaseoteam/Phaseo/commit/b7fb6a1faa315a68ed4b39a230711c0ae3cbc613) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove redundant OpenRouter-specific links from the global footer navigation.

- [#2200](https://github.com/phaseoteam/Phaseo/pull/2200) [`79490ed`](https://github.com/phaseoteam/Phaseo/commit/79490ed7b6c215837e1b140c05b2d8039d0e8c61) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve mobile catalog navigation, attention filters, persistent save controls, and failed-save reporting. Preserve all catalog records in midnight UTC exports, including rows without update timestamps.
  
  Match catalog searches by display name and ID regardless of punctuation. Replace native editor controls with shared ShadCN components and simplify pricing into provider price groups with focused editing panels, guided charge selection, billing-unit conversion, and discardable drafts.
  
  Make long catalog dropdowns searchable and replace the provider grid and expanded forms with compact connected-route rows and a tabbed editor.
  
  Replace categorical text inputs with searchable choices. Preserve saved prices as dated versions, end-date catalogue relationships, and record baseline plus append-only row history across all catalogue tables. Keep ended records out of current public results and expose recent model changes in the internal editor.
  
  Create and edit regional offers from Providers, with parent families, region labels, residency settings and separate API endpoints. Show labelled offers in model selectors and preserve existing gateway routing flags.
  
  Warn before leaving unfinished catalog edits, including browser history navigation. Restore admin model notice saves with validation and complete history, reject malformed clear requests, and distinguish cache refresh failures from successful saves.
  
  Manage stealth provider routes from the catalog editor, with anonymous route IDs, preserved pricing history, and explicit public identity controls.

- [#2002](https://github.com/phaseoteam/Phaseo/pull/2002) [`7e74943`](https://github.com/phaseoteam/Phaseo/commit/7e7494325af6fe7cb3a5c3ca60da88c0c638bfd9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Support standalone free API model identities and migrate free-only catalogue entries away from synthetic base rows.

- [#2192](https://github.com/phaseoteam/Phaseo/pull/2192) [`db6655d`](https://github.com/phaseoteam/Phaseo/commit/db6655d67f421c5da80e6113f8e1b94a58f2149c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Correct GPT-6 Astra parameter metadata, preserve OpenAI Responses async tool settings, and pass OpenAI prompt cache options through the gateway.

- [#2261](https://github.com/phaseoteam/Phaseo/pull/2261) [`a71f061`](https://github.com/phaseoteam/Phaseo/commit/a71f061a06efd8c5aee68af4fb6c098e79fa2e9d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Organise API keys by status and last use, add status filters, and avoid rerendering unchanged rows when selecting keys.

- [#2277](https://github.com/phaseoteam/Phaseo/pull/2277) [`5c491b4`](https://github.com/phaseoteam/Phaseo/commit/5c491b4d57d4ca730e6778f558b04590cc1a6ee2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retain removed catalogue records with end dates during import, retire obsolete route capabilities and aliases, and hide retired subscription plans from public reads.

- [#1489](https://github.com/phaseoteam/Phaseo/pull/1489) [`5f2183d`](https://github.com/phaseoteam/Phaseo/commit/5f2183d99d262baedab7b7e9e4902c0598342571) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve model performance filters on smaller screens, clarify empty chart states, add detailed chart tooltips, and give every percentile series a distinct colour.

- [#1874](https://github.com/phaseoteam/Phaseo/pull/1874) [`dda4e28`](https://github.com/phaseoteam/Phaseo/commit/dda4e2856e13d88e2b1be3ac9272db244e320e76) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile OrcaRouter's live model catalog, modalities, lifecycle state, protocol support, and published pricing.

- [#1751](https://github.com/phaseoteam/Phaseo/pull/1751) [`8dd51b8`](https://github.com/phaseoteam/Phaseo/commit/8dd51b82a33e14a7e4b78365a7aebba6bbc0cd71) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove the provider-count header line and preserve 4:3 flag proportions in the Headquarters filter.

- [#1758](https://github.com/phaseoteam/Phaseo/pull/1758) [`06ba3d1`](https://github.com/phaseoteam/Phaseo/commit/06ba3d15134ab82dba4e275cdf52ea4cb9418273) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider datacenter filtering and align the Providers table controls with the Models page.

- [#2265](https://github.com/phaseoteam/Phaseo/pull/2265) [`8d5efa6`](https://github.com/phaseoteam/Phaseo/commit/8d5efa6d101e80636eb7644c76e1c6d52870fc31) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve regional provider names in request routing traces, usage views, provider catalogues, model availability and comparisons, pricing inspectors, playground models, and routing settings.

- [#2034](https://github.com/phaseoteam/Phaseo/pull/2034) [`03a1020`](https://github.com/phaseoteam/Phaseo/commit/03a10205c963bb5f119ff88f90896af42872318f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve capability- and service-tier-specific provider policy metadata in pricing responses and displays.

- [#1724](https://github.com/phaseoteam/Phaseo/pull/1724) [`16032a6`](https://github.com/phaseoteam/Phaseo/commit/16032a66724c7225ead621e7aee79e5c6a1607f7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Improve usage-log inspection with layered side sheets, session headline details, request navigation, generation lookup, and contextual row actions.

- [#2290](https://github.com/phaseoteam/Phaseo/pull/2290) [`28e193a`](https://github.com/phaseoteam/Phaseo/commit/28e193a56b8de33b9824c133aca81ba71d68d0ed) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update the Chat UI's default favourite models to the latest featured model versions.

- [#2219](https://github.com/phaseoteam/Phaseo/pull/2219) [`ed5b49f`](https://github.com/phaseoteam/Phaseo/commit/ed5b49f5bd212e27da58c45f00383049b5bc55a3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add missing LTX audio and resolution prices, correct BytePlus Seedance token tiers and OrcaRouter video units, and prevent automatic discovery from flattening conditional video prices into request fees. Document video billing dimensions.

- [#1274](https://github.com/phaseoteam/Phaseo/pull/1274) [`af29c02`](https://github.com/phaseoteam/Phaseo/commit/af29c0298ead32e754aecebcd023f689e4199fdb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add workspace-scoped Private Models with encrypted OpenAI-compatible endpoint credentials, management APIs, model discovery, and gateway routing.

- [#2266](https://github.com/phaseoteam/Phaseo/pull/2266) [`65ce750`](https://github.com/phaseoteam/Phaseo/commit/65ce7502a5b00c9b397a2e62b16d3ff4c7eac002) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Include a Resend-managed unsubscribe link in the welcome email's HTML and plain text.

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
