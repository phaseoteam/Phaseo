# @phaseo/sdk

## 3.0.0

### Major Changes

- [#779](https://github.com/phaseoteam/Phaseo/pull/779) [`343999e`](https://github.com/phaseoteam/Phaseo/commit/343999eb91189dc7a402fb173196c2769816ce8c) Thanks [@opencode-agent](https://github.com/apps/opencode-agent)! - Refresh generated callable model ID constants from the current OpenAPI snapshot.

  This removes retired/non-callable constants including CrofAI `greg-1` and `greg-1-super`, older Anthropic Claude aliases, several free Gemma variants, older NVIDIA/Qwen entries, and older xAI Grok entries. It also adds newly callable constants for Anthropic Claude Fable 5, Moonshot Kimi K2.7 Code, Nex AGI Nex N2 Pro, NVIDIA Nemotron 3 Ultra 550B A55B, Stepfun Step 3.7 Flash, and Z.AI GLM 5.2.

- [#756](https://github.com/phaseoteam/Phaseo/pull/756) [`232c535`](https://github.com/phaseoteam/Phaseo/commit/232c535b651fc1d8988f0867919873646cda0093) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Remove retired Anthropic Claude 4 model ID constants from SDK surfaces and align provider retirement metadata across Anthropic provider catalogs.

### Minor Changes

- [#567](https://github.com/phaseoteam/Phaseo/pull/567) [`b3bbccf`](https://github.com/phaseoteam/Phaseo/commit/b3bbccf8988d6d50f9412d1b91f0518e6a1bcec1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enable the public Batch API and Files routes, add managed batch webhook processing, and expose TypeScript SDK helpers for polling batches, listing request rows, and verifying signed webhook deliveries.

### Patch Changes

- [#786](https://github.com/phaseoteam/Phaseo/pull/786) [`b94beae`](https://github.com/phaseoteam/Phaseo/commit/b94beae46483f5b493d6b05dfefca41dfa8b7baa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add CrofAI `greg-2-super` and `greg-2-ultra` to generated known model ID types.

- [#727](https://github.com/phaseoteam/Phaseo/pull/727) [`3b53631`](https://github.com/phaseoteam/Phaseo/commit/3b53631222ecbc5b92d712a79edab4be8949c533) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add `z-ai/glm-5.2` to generated known model ID types.

- [#948](https://github.com/phaseoteam/Phaseo/pull/948) [`c420a38`](https://github.com/phaseoteam/Phaseo/commit/c420a389be727d45daa13713658cd341081a5d3b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add GPT-5.6 Luna Pro, Sol Pro, and Terra Pro model IDs, routing them to OpenAI with `reasoning.mode=pro` while preserving separate public slugs.

- [#950](https://github.com/phaseoteam/Phaseo/pull/950) [`685ef25`](https://github.com/phaseoteam/Phaseo/commit/685ef2572a09663ffe417aed33b38e6521317801) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve GPT-5.6 Pro `max` reasoning effort, expose `reasoning.mode` in SDK request types, and send stable OpenAI safety identifiers.

- [#1186](https://github.com/phaseoteam/Phaseo/pull/1186) [`50a86ea`](https://github.com/phaseoteam/Phaseo/commit/50a86ead054c28df51fd30bb3267a0c0059205ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Poolside's Laguna S 2.1 model with its free preview gateway route, 1M-token context metadata, and release benchmarks.

## 2.0.5

### Patch Changes

- [#610](https://github.com/phaseoteam/Phaseo/pull/610) [`54e6640`](https://github.com/phaseoteam/Phaseo/commit/54e6640d8cd7a4062c54d47a9f8010b65273939f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Agent SDK devtools capture, expand TypeScript SDK high-level helpers for generated API operations, and extend devtools endpoint metadata for agent runs.

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

## 1.0.2

### Patch Changes

- Regenerate SDK artifacts from the latest OpenAPI spec and publish a patch version update for the refreshed clients.

## 1.0.1

### Patch Changes

- [#47](https://github.com/phaseoteam/Phaseo/pull/47) [`3d6f643`](https://github.com/phaseoteam/Phaseo/commit/3d6f64336d20794c6f44c16a0f04cbf325ebdbdf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bundle devtools core primitives directly into the TypeScript SDK and devtools viewer so runtime installs no longer depend on `@phaseo/devtools-core`.

  Also harden publish reliability by validating `NPM_TOKEN` in CI and fixing Python `pyproject.toml` version sync.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the API and all SDKs for a coordinated breaking release.

  This captures breaking changes across endpoint surfaces, protocol/IR conversions,
  provider routing/usage behavior, and regenerated SDK interfaces from the latest
  OpenAPI definitions.

### Minor Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerate SDKs against the latest OpenAPI spec and refresh runtime helpers for the TS and Python clients.

### Patch Changes

- [#13](https://github.com/phaseoteam/Phaseo/pull/13) [`d280bf0`](https://github.com/phaseoteam/Phaseo/commit/d280bf07747eb9b07e8aff7a1dcf36038240bc11) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bump all SDKs for the next alpha drop so they land on 0.2.1-alpha.0 together.

## 0.2.1-alpha.0

### Patch Changes

- Bump all SDKs for the next alpha drop so they land on 0.2.1-alpha.0 together.

## 0.2.0

### Minor Changes

- [#8](https://github.com/phaseoteam/Phaseo/pull/8) [`144dad5`](https://github.com/phaseoteam/Phaseo/commit/144dad5cbf8f56b0e1d987b0eafb9d0be5a98d5e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerated the SDKs from the latest OpenAPI spec to reflect the updated Gateway API contract. This may include typing and surface-area changes where the API schema changed.

## 0.1.4

### Patch Changes

- [#6](https://github.com/phaseoteam/Phaseo/pull/6) [`4322886`](https://github.com/phaseoteam/Phaseo/commit/4322886327dde92030846969718c9131a2a30431) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add some older Google Models + IF Bench

## 0.1.3

### Patch Changes

- [`d322b30`](https://github.com/phaseoteam/Phaseo/commit/d322b30bbe33cde56ca80f17c5612c4609d58f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Nova 2 Models + Adjust Deepseek V3.2

## 0.1.2

### Patch Changes

- [`6210556`](https://github.com/phaseoteam/Phaseo/commit/62105560578881ccfb086074755ab1a8bf67d767) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Mistral 3 Models

## 0.1.1

### Patch Changes

- [`b9d9fd5`](https://github.com/phaseoteam/Phaseo/commit/b9d9fd5b7a8e01aa587f119fc0abc84ea2bb01c6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update README
