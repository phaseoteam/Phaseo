# @phaseo/data-catalog

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
