# @phaseo/data-catalog

## 0.1.0

### Minor Changes

- [#1666](https://github.com/phaseoteam/Phaseo/pull/1666) [`b690c19`](https://github.com/phaseoteam/Phaseo/commit/b690c195943491b9706ac445140f686f1f75b557) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Overhaul provider protocol, capability, media, batch, usage, and catalog contracts against current first-party API documentation.

### Patch Changes

- [#1760](https://github.com/phaseoteam/Phaseo/pull/1760) [`7112de0`](https://github.com/phaseoteam/Phaseo/commit/7112de09ae6537562c746b03ccfd8409247750ac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add DeepSeek V4 Flash Vision Exp with image input support, verified pricing, and generated SDK model identifiers.

- [#1644](https://github.com/phaseoteam/Phaseo/pull/1644) [`83fbb58`](https://github.com/phaseoteam/Phaseo/commit/83fbb5855bc8599a2fe607dd0830770ccb205ba1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Together's discovered Qwen/Qwen3.8-2.4T-A95B provider model mapping.

- [#1645](https://github.com/phaseoteam/Phaseo/pull/1645) [`72aa9c9`](https://github.com/phaseoteam/Phaseo/commit/72aa9c9150b6e7c050ee7fafd64ad4c18c92be37) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Venice's NVIDIA Nemotron 3.5 Lightning 30B A3B deployment and pricing.

- [#1770](https://github.com/phaseoteam/Phaseo/pull/1770) [`123abbc`](https://github.com/phaseoteam/Phaseo/commit/123abbcfa38d010fedf8e6b8646e0d7ef6b0917d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reconcile Venice model support and pricing with the live provider inventory. Removed Venice route constants are a breaking SDK change; current replacements and newly supported models are included.

- [#1315](https://github.com/phaseoteam/Phaseo/pull/1315) [`57c16c3`](https://github.com/phaseoteam/Phaseo/commit/57c16c37abb38be1d7cdb821775e8b0f056bc1dd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Move Amazon Bedrock text inference onto Mantle Responses, Chat Completions, and Anthropic Messages, and correct catalog reference validation so supported legacy identities and API-model aliases resolve without warnings.

- [#1719](https://github.com/phaseoteam/Phaseo/pull/1719) [`36605ea`](https://github.com/phaseoteam/Phaseo/commit/36605eaeb469f6760a5a017339190f61d111d026) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable GLM 5.3 gateway routing with verified Z.AI Model API availability and pricing.

- [#1756](https://github.com/phaseoteam/Phaseo/pull/1756) [`54a8aa1`](https://github.com/phaseoteam/Phaseo/commit/54a8aa12a0d3af2ea66c3eb8c68c1234c29ed576) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh MiniMax speech, image, music, language, web-search, and video pricing support.

- [#1656](https://github.com/phaseoteam/Phaseo/pull/1656) [`933df4c`](https://github.com/phaseoteam/Phaseo/commit/933df4ce3dd63a93a55a88b50623cab5441f09a2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral OCR 4.1 with active gateway routing and verified standard and Batch API pricing.

- [#1778](https://github.com/phaseoteam/Phaseo/pull/1778) [`a3e5cfa`](https://github.com/phaseoteam/Phaseo/commit/a3e5cfa410c4eed55a581aec21f74abc52bfe3fc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Apply the GPT-5.6 Sol promotion to OpenAI Standard, Flex, Priority, and Batch pricing for Sol and Sol Pro.

- [#1647](https://github.com/phaseoteam/Phaseo/pull/1647) [`5f60f69`](https://github.com/phaseoteam/Phaseo/commit/5f60f693f8ff8f3d7734b0dc1e289e8ec44c5dd7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Schedule DeepSeek V4 peak and off-peak pricing from August 16, 2026.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add inherited provider and route geographic availability policies, request-origin country and subdivision enforcement, published upstream restrictions for OpenAI, Anthropic, Gemini API, ElevenLabs, Z.AI, and LongCat, fallback diagnostics, and a dedicated unavailable-region API response. Require users to confirm their location and acknowledge the displayed restrictions before purchasing credits, serve the creator-branded model preview through a short-lived edge-cached web API projection, and collect full billing addresses for new-card checkouts.

- [#1642](https://github.com/phaseoteam/Phaseo/pull/1642) [`e623f8f`](https://github.com/phaseoteam/Phaseo/commit/e623f8f63a8bdabff6685bd00eadbb477a391449) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove duplicate Windsurf subscription-plan model entries and reject duplicate model IDs during catalog validation.

- [#1746](https://github.com/phaseoteam/Phaseo/pull/1746) [`117f53d`](https://github.com/phaseoteam/Phaseo/commit/117f53d7a445de662c2e84362a898187bc2fa6ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Route Google AI Studio models through the Gemini API surface they support, restore explicit cached-content requests, omit unsupported task metadata for Gemini Embedding 2, and correct current Gemini API model lifecycles.

- [#1747](https://github.com/phaseoteam/Phaseo/pull/1747) [`4ff07fb`](https://github.com/phaseoteam/Phaseo/commit/4ff07fb27624f7916c1ca7da7182c1013d150449) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Z.AI model availability, documented context and output limits, and native web-search pricing.

- [#1640](https://github.com/phaseoteam/Phaseo/pull/1640) [`c3eadef`](https://github.com/phaseoteam/Phaseo/commit/c3eadef8fec7bf5347e92f81d351dada4c19f11c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Grok 4.6 with verified xAI API pricing and capabilities, record Qwen3.8-Max's open-weight release and new Fireworks and DigitalOcean deployments, and move DeepSeek's stable V4 Pro provider route to V4 Pro 0813.

- [#1497](https://github.com/phaseoteam/Phaseo/pull/1497) [`0d9465a`](https://github.com/phaseoteam/Phaseo/commit/0d9465af733b9b8e49385fce716456c05a3585cb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Disable the region-restricted Meta Muse Spark 1.2 Contributor route, document its availability limits, and normalize Fish Audio voice-design request pricing so catalog imports remain valid.

- [#1630](https://github.com/phaseoteam/Phaseo/pull/1630) [`cdc8b7d`](https://github.com/phaseoteam/Phaseo/commit/cdc8b7d8e0a3f7802ab6ff29e9ec61ba8473d736) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral Standard, Batch, and Priority pricing for GLM 5.2, plus EU regional routing and tier-aware billing based on Mistral's observed response tier.

- [#1632](https://github.com/phaseoteam/Phaseo/pull/1632) [`002ded5`](https://github.com/phaseoteam/Phaseo/commit/002ded5934fc6bdb7752995c333bc2ebb2fd96a4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral Batch and Priority reference pricing across eligible catalog entries while keeping Priority routing gated by explicit model capability metadata.

- [#1501](https://github.com/phaseoteam/Phaseo/pull/1501) [`4e6efde`](https://github.com/phaseoteam/Phaseo/commit/4e6efde552704926ba8fc09285afbeaa5c9fb978) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Novita routes and pricing for Ling 3.0 Tiny, Macaron V1 Tall, and Nemotron 3 Nano 30B A3B. Move Ling 3.0 Flash from its expired free route to current paid pricing, and correct Novita's DeepSeek V4 Flash 0731 route metadata.

- [#1648](https://github.com/phaseoteam/Phaseo/pull/1648) [`949cb67`](https://github.com/phaseoteam/Phaseo/commit/949cb67df3675d0610b89f7e670abe7685aebcfd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare Gemini 3.7 Flash with the published Google Cloud SKU pricing matrix for Google AI Studio and Vertex AI, add cached video-token pricing support, and mark recent Gemini Flash models as closed weight.

- [#1761](https://github.com/phaseoteam/Phaseo/pull/1761) [`222029f`](https://github.com/phaseoteam/Phaseo/commit/222029fed95647313ad3c971838e60dddd5fd27f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Aion Labs model availability, lifecycle metadata, limits, capabilities, and current and historical token pricing.

- [#1759](https://github.com/phaseoteam/Phaseo/pull/1759) [`e5fc123`](https://github.com/phaseoteam/Phaseo/commit/e5fc123aa1120b645e5be15ac03ad4d64e9612da) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Google Vertex and Vertex EU model lifecycles, callable routes, and current Gemini, Claude, and Veo pricing.

- [#1753](https://github.com/phaseoteam/Phaseo/pull/1753) [`0cfabaa`](https://github.com/phaseoteam/Phaseo/commit/0cfabaaab70917ea7ffb4b0b6b7dca0e58403342) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Morph model availability, multimodal support, limits, and pricing.

- [#1750](https://github.com/phaseoteam/Phaseo/pull/1750) [`749b6b6`](https://github.com/phaseoteam/Phaseo/commit/749b6b6dea4e4e8ac9e401c85799c2e934368053) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Together serverless model availability, pricing, context limits, vision capabilities, and multimodal image and audio routing.

- [#1757](https://github.com/phaseoteam/Phaseo/pull/1757) [`ad787df`](https://github.com/phaseoteam/Phaseo/commit/ad787dfecddb6c8c350db2e2418a256adc7e6039) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Retire AI21 gateway routes after loss of API dashboard and inference access while preserving historical models and pricing.

- [#1641](https://github.com/phaseoteam/Phaseo/pull/1641) [`89cb74d`](https://github.com/phaseoteam/Phaseo/commit/89cb74df13f29fd6ec91c1d2d656243a4718f54d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Separate the hosted Qwen 3.8 Max API model from the text-only Qwen3.8 2.4T A95B open-weight checkpoint and assign matching provider deployments to the correct identity.

- [#1503](https://github.com/phaseoteam/Phaseo/pull/1503) [`868c9af`](https://github.com/phaseoteam/Phaseo/commit/868c9afb54f0507fc40fd84464fdc9d396803e70) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add direct Upstage routes and pricing for Solar Pro 4, Solar Pro 3, Solar Pro 2, and Solar Mini, including Solar Pro 4's dated launch promotion. Add Solar Open 100B and Solar Open 2 250B metadata, and correct existing Solar model specifications and lineage.

## 0.0.2

### Patch Changes

- [#1255](https://github.com/phaseoteam/Phaseo/pull/1255) [`8f8a349`](https://github.com/phaseoteam/Phaseo/commit/8f8a3494c05c0df6641b065b59fd36533f21f7cf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare Kimi K3 for its public weights release by linking the official Hugging Face repository, surfacing the July 27, 2026 at 15:00 UTC release time, and adding non-routable coming-soon entries for Together, Baseten, and Fireworks.

## 0.0.1

### Patch Changes

- [#1034](https://github.com/phaseoteam/Phaseo/pull/1034) [`51cd76e`](https://github.com/phaseoteam/Phaseo/commit/51cd76e0567ac3fe86411d7a5babb8816d7812e2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add GPT-Red as a withheld OpenAI safety research model. The entry documents its internal red-teaming purpose and official announcement without adding provider mappings, pricing, aliases, or callable gateway access.

- [#1035](https://github.com/phaseoteam/Phaseo/pull/1035) [`66dc5fb`](https://github.com/phaseoteam/Phaseo/commit/66dc5fb500ce46950564c61cba731f1d9893019b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Thinking Machines Lab's Inkling and Inkling-Small models. The canonical Inkling model retains its native 1M-token context and maps to Tinker's 256K variant by default; the shorter Tinker offering is exposed separately as `thinking-machines/inkling-64k`. Inkling-Small is recorded as coming soon because Tinker explicitly lists it as coming soon and no public weights or hosted API identifier were found.

- [#1189](https://github.com/phaseoteam/Phaseo/pull/1189) [`eb8ad69`](https://github.com/phaseoteam/Phaseo/commit/eb8ad69bb4c1b5ffbdcccfae5d98d58acb703f62) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Correct Poolside's data-policy metadata to reflect opt-out training terms and log retention.

- [#1193](https://github.com/phaseoteam/Phaseo/pull/1193) [`8dbf5f2`](https://github.com/phaseoteam/Phaseo/commit/8dbf5f2aa9bc3aecb1e2cfe85892b208b58cb2f9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh Poolside's provider policy metadata so the importer persists the corrected data-policy classification.

- [#1120](https://github.com/phaseoteam/Phaseo/pull/1120) [`b74b0da`](https://github.com/phaseoteam/Phaseo/commit/b74b0da67485853fc3dcc1f0152422da81b15221) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make time-windowed provider billing use the successful upstream fetch timestamp, persist the exact billing timestamp in pricing lines, avoid request-start fallback when authoritative timing is missing, and expire cached price cards at effective-date boundaries. Prepare DeepSeek V4 pricing rules to use upstream-send timing once official time windows become active. Show the currently active time-window rate in model provider tables and place it ahead of alternate period pricing in provider sheets.

- [#1031](https://github.com/phaseoteam/Phaseo/pull/1031) [`e877d84`](https://github.com/phaseoteam/Phaseo/commit/e877d849390608a2e95dd01645640925bc4fc1e9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare a coming-soon Claude Opus 5 catalog record with inactive provider mappings for Anthropic, Google Vertex AI, and Amazon Bedrock. Pricing, release metadata, aliases, and confirmed provider limits remain unset until Anthropic publishes the final details.

- [#1030](https://github.com/phaseoteam/Phaseo/pull/1030) [`59eca40`](https://github.com/phaseoteam/Phaseo/commit/59eca407417e1df020b2cde66e0489704db8b243) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare Moonshot AI's Kimi K3 catalog entry for its July 16 release with its official 2.8-trillion-parameter architecture, text/image/video input, 1,048,576-token context and output limits, supported API features, and official Moonshot pricing. Add verified GMI Cloud, Novita, and Venice provider availability, provider-specific limits, and pricing. Keep the model links limited to Moonshot's official Kimi K3 API reference, and omit the unpublished Venice E2EE placeholder until Venice exposes a live route and price. Update the Moonshot adapter for K3's top-level max reasoning effort, strict structured outputs, video payloads, and reasoning-content continuity.

- [#1186](https://github.com/phaseoteam/Phaseo/pull/1186) [`50a86ea`](https://github.com/phaseoteam/Phaseo/commit/50a86ead054c28df51fd30bb3267a0c0059205ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Poolside's Laguna S 2.1 model with its free preview gateway route, 1M-token context metadata, and release benchmarks.

- [#1036](https://github.com/phaseoteam/Phaseo/pull/1036) [`77663cd`](https://github.com/phaseoteam/Phaseo/commit/77663cda332cc7f02848581a233545d5eeca2a97) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Activate Tinker as a gateway provider for the verified Inkling 256K and 64K inference variants.
