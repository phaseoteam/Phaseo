# @phaseo/agent-sdk-rust

## 0.2.0

### Minor Changes

- [#2419](https://github.com/phaseoteam/Phaseo/pull/2419) [`9707bde`](https://github.com/phaseoteam/Phaseo/commit/9707bded84ce41b65f3b9a4ada4b8fc8c56c4e95) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish working ESM and CommonJS entrypoints and remove the AI SDK provider's repository-only install hook. Coordinate language Agent SDK versions, core dependencies, attribution and Go module paths with the core SDK release. Keep Rust core and Agent SDKs on their pre-1.0 compatibility lines.

### Patch Changes

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Identify every official SDK and Agent SDK as its canonical technical request Source without setting App attribution.

- [#1477](https://github.com/phaseoteam/Phaseo/pull/1477) [`d7a89ff`](https://github.com/phaseoteam/Phaseo/commit/d7a89ff55d67fb8cb05ad8345fe0203c91470726) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require explicit approval before executing approval-gated tools and reject externally supplied outputs for those calls.
