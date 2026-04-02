# @ai-stats/java-sdk

## 1.1.1

### Patch Changes

- Auto-release functional SDK packages after OpenAPI or model-surface changes.

  Excluded for now: @ai-stats/cpp-sdk and @ai-stats/rust-sdk.

## 1.1.0

### Minor Changes

- [#201](https://github.com/AI-Stats/AI-Stats/pull/201) [`31a2268`](https://github.com/AI-Stats/AI-Stats/commit/31a226829939099401558cb206890d9fede74495) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bump all functional SDKs to 1.1.0 due to model-surface changes and cross-language SDK updates.

## 1.0.1

### Patch Changes

- Add Java, C++, and Rust SDKs to the OpenAPI generation pipeline and refresh their generated client artifacts.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/AI-Stats/AI-Stats/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prepare the API and all SDKs for a coordinated breaking release.

  This captures breaking changes across endpoint surfaces, protocol/IR conversions,
  provider routing/usage behavior, and regenerated SDK interfaces from the latest
  OpenAPI definitions.

### Minor Changes

- [`f610264`](https://github.com/AI-Stats/AI-Stats/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Regenerate language SDKs against the latest OpenAPI spec.
