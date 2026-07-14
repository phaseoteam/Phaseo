# @ai-stats/devtools-viewer

## 0.2.1

### Patch Changes

- [#610](https://github.com/AI-Stats/AI-Stats/pull/610) [`54e6640`](https://github.com/AI-Stats/AI-Stats/commit/54e6640d8cd7a4062c54d47a9f8010b65273939f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Agent SDK devtools capture, expand TypeScript SDK high-level helpers for generated API operations, and extend devtools endpoint metadata for agent runs.

## 0.2.0

### Minor Changes

- [#201](https://github.com/AI-Stats/AI-Stats/pull/201) [`31a2268`](https://github.com/AI-Stats/AI-Stats/commit/31a226829939099401558cb206890d9fede74495) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Minor Devtools Viewer release with UX and debugging improvements:
  - Persist selected generation in URL query state.
  - Prefer gateway request IDs in viewer display and lookup handling.
  - Improve response detail rendering with structured, readable output sections.
  - Refine sidebar/header/status styling and refresh behavior.
  - Add robust token/cost fallbacks from response usage/pricing breakdown when metadata is partial.

## 0.1.1

### Patch Changes

- [#47](https://github.com/AI-Stats/AI-Stats/pull/47) [`3d6f643`](https://github.com/AI-Stats/AI-Stats/commit/3d6f64336d20794c6f44c16a0f04cbf325ebdbdf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bundle devtools core primitives directly into the TypeScript SDK and devtools viewer so runtime installs no longer depend on `@ai-stats/devtools-core`.

  Also harden publish reliability by validating `NPM_TOKEN` in CI and fixing Python `pyproject.toml` version sync.
