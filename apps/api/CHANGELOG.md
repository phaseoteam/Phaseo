# @ai-stats/gateway-api

## 1.1.0

### Minor Changes

- [#690](https://github.com/AI-Stats/AI-Stats/pull/690) [`af6ff27`](https://github.com/AI-Stats/AI-Stats/commit/af6ff273326b9cadcf103f89eba19bf0fcfcfee0) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expand Gateway server tools with AI Stats-branded web search, fetch, managed Advisor, image generation, and apply-patch tools, native web-search/fetch conversion, managed Exa/Parallel/Firecrawl search and fetch controls, domain filters, result caps, billable server-tool pricing meters, and `openai/gpt-image-2` as the default image-generation server-tool model.

### Patch Changes

- [#698](https://github.com/AI-Stats/AI-Stats/pull/698) [`0e2b089`](https://github.com/AI-Stats/AI-Stats/commit/0e2b08926392579dbfb883be3f5f7947070f7b4f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Moonshot `kimi-k2.7-code` to the catalog and gateway, including direct-provider pricing, subscription-plan coverage, and Moonshot request normalization for the model's stricter thinking, sampling, and tool-choice rules.

- [#562](https://github.com/AI-Stats/AI-Stats/pull/562) [`1809a4b`](https://github.com/AI-Stats/AI-Stats/commit/1809a4b3d45f198ba9c5f8b079d8b00027aaf742) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden the CLI and OAuth app flows, add dedicated CLI CI coverage, and document the first public AI Stats CLI release surface.

- [#495](https://github.com/AI-Stats/AI-Stats/pull/495) [`175d2f2`](https://github.com/AI-Stats/AI-Stats/commit/175d2f2ee13e4ff7d99c7285d2532be6ec4996d2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Refresh gateway provider activation and routing coverage across newly added regional providers, audio speech support, and free-router aligned catalogue behavior.

## 1.0.1

### Patch Changes

- Bump gateway API package version for the current backend/runtime updates.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/AI-Stats/AI-Stats/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the API and all SDKs for a coordinated breaking release.

  This captures breaking changes across endpoint surfaces, protocol/IR conversions,
  provider routing/usage behavior, and regenerated SDK interfaces from the latest
  OpenAPI definitions.

### Patch Changes

- [`f610264`](https://github.com/AI-Stats/AI-Stats/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update gateway and docs for recent API changes and documentation fixes.

## 0.2.0

### Minor Changes

- [#8](https://github.com/AI-Stats/AI-Stats/pull/8) [`144dad5`](https://github.com/AI-Stats/AI-Stats/commit/144dad5cbf8f56b0e1d987b0eafb9d0be5a98d5e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Updated the Gateway API schema to be a superset of OpenAI’s request/response formats. This alignment is the direction going forward to keep compatibility predictable over time.
