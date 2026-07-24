# @phaseo/rust-sdk

## 2.0.0

### Major Changes

- [#779](https://github.com/phaseoteam/Phaseo/pull/779) [`343999e`](https://github.com/phaseoteam/Phaseo/commit/343999eb91189dc7a402fb173196c2769816ce8c) Thanks [@opencode-agent](https://github.com/apps/opencode-agent)! - Refresh generated callable model ID constants from the current OpenAPI snapshot.

  This removes retired/non-callable constants including CrofAI `greg-1` and `greg-1-super`, older Anthropic Claude aliases, several free Gemma variants, older NVIDIA/Qwen entries, and older xAI Grok entries. It also adds newly callable constants for Anthropic Claude Fable 5, Moonshot Kimi K2.7 Code, Nex AGI Nex N2 Pro, NVIDIA Nemotron 3 Ultra 550B A55B, Stepfun Step 3.7 Flash, and Z.AI GLM 5.2.

### Patch Changes

- [#786](https://github.com/phaseoteam/Phaseo/pull/786) [`b94beae`](https://github.com/phaseoteam/Phaseo/commit/b94beae46483f5b493d6b05dfefca41dfa8b7baa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add CrofAI `greg-2-super` and `greg-2-ultra` to generated known model ID types.

- [#950](https://github.com/phaseoteam/Phaseo/pull/950) [`685ef25`](https://github.com/phaseoteam/Phaseo/commit/685ef2572a09663ffe417aed33b38e6521317801) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve GPT-5.6 Pro `max` reasoning effort, expose `reasoning.mode` in SDK request types, and send stable OpenAI safety identifiers.

- [#1186](https://github.com/phaseoteam/Phaseo/pull/1186) [`50a86ea`](https://github.com/phaseoteam/Phaseo/commit/50a86ead054c28df51fd30bb3267a0c0059205ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Poolside's Laguna S 2.1 model with its free preview gateway route, 1M-token context metadata, and release benchmarks.

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
