# @phaseo/gateway-api

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
