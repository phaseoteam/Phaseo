# @ai-stats/go-sdk

## 2.0.3

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (sdk/openapi changes).

  Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.

## 2.0.2

### Patch Changes

- [#396](https://github.com/AI-Stats/AI-Stats/pull/396) [`0023fc3`](https://github.com/AI-Stats/AI-Stats/commit/0023fc3c6d87a007189bfe1d0c8c13af8db3f21d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Separate catalog model discovery from callable SDK helper IDs.

  Request-side model identifiers are now treated as runtime strings so newly released
  models can be used without waiting for an SDK release. Generated helper constants
  are now sourced from the current callable-on-gateway snapshot instead of the full
  catalog, and SDK release automation treats model helper churn as patch-level data
  updates instead of forcing minor or major version jumps.

## 2.0.1

### Patch Changes

- [#367](https://github.com/AI-Stats/AI-Stats/pull/367) [`4153c29`](https://github.com/AI-Stats/AI-Stats/commit/4153c293f05414e68dcfd4e0d6b84952b2ec6fcd) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Separate catalog model discovery from callable SDK helper IDs.

  Request-side model identifiers are now treated as runtime strings so newly released
  models can be used without waiting for an SDK release. Generated helper constants
  are now sourced from the current callable-on-gateway snapshot instead of the full
  catalog, and SDK release automation treats model helper churn as patch-level data
  updates instead of forcing minor or major version jumps.

## 2.0.0

### Major Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (model IDs removed (1) [qwen/qwen3-tts-tokenizer-12hz]).

  Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.

## 1.2.0

### Minor Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (model IDs added (1) [x-ai/grok-4.3]).

  Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.

## 1.1.3

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (sdk/openapi changes with no model-id surface changes).

  Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.

## 1.1.2

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes (sdk/openapi changes with no model-id surface changes).

  Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.

## 1.1.1

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes.

  Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.

## 1.1.0

### Minor Changes

- [#201](https://github.com/AI-Stats/AI-Stats/pull/201) [`31a2268`](https://github.com/AI-Stats/AI-Stats/commit/31a226829939099401558cb206890d9fede74495) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bump all functional SDKs to 1.1.0 due to model-surface changes and cross-language SDK updates.

## 1.0.1

### Patch Changes

- Regenerate SDK artifacts from the latest OpenAPI spec and publish a patch version update for the refreshed clients.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/AI-Stats/AI-Stats/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the API and all SDKs for a coordinated breaking release.

  This captures breaking changes across endpoint surfaces, protocol/IR conversions,
  provider routing/usage behavior, and regenerated SDK interfaces from the latest
  OpenAPI definitions.

### Minor Changes

- [`f610264`](https://github.com/AI-Stats/AI-Stats/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerate language SDKs against the latest OpenAPI spec.

### Patch Changes

- [#13](https://github.com/AI-Stats/AI-Stats/pull/13) [`d280bf0`](https://github.com/AI-Stats/AI-Stats/commit/d280bf07747eb9b07e8aff7a1dcf36038240bc11) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bump all SDKs for the next alpha drop so they land on 0.2.1-alpha.0 together.

## 0.2.1-alpha.0

### Patch Changes

- Bump all SDKs for the next alpha drop so they land on 0.2.1-alpha.0 together.

## 0.1.0

### Minor Changes

- [#8](https://github.com/AI-Stats/AI-Stats/pull/8) [`144dad5`](https://github.com/AI-Stats/AI-Stats/commit/144dad5cbf8f56b0e1d987b0eafb9d0be5a98d5e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerated the SDKs from the latest OpenAPI spec to reflect the updated Gateway API contract. This may include typing and surface-area changes where the API schema changed.

## 0.0.1

### Patch Changes

- [`d322b30`](https://github.com/AI-Stats/AI-Stats/commit/d322b30bbe33cde56ca80f17c5612c4609d58f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Nova 2 Models + Adjust Deepseek V3.2
