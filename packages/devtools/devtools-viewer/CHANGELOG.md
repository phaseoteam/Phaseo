# @ai-stats/devtools-viewer

## 0.1.1

### Patch Changes

- [#47](https://github.com/AI-Stats/AI-Stats/pull/47) [`3d6f643`](https://github.com/AI-Stats/AI-Stats/commit/3d6f64336d20794c6f44c16a0f04cbf325ebdbdf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bundle devtools core primitives directly into the TypeScript SDK and devtools viewer so runtime installs no longer depend on `@ai-stats/devtools-core`.

  Also harden publish reliability by validating `NPM_TOKEN` in CI and fixing Python `pyproject.toml` version sync.
