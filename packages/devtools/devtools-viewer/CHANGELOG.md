# @phaseo/devtools-viewer

## 0.2.2

### Patch Changes

- [#728](https://github.com/phaseoteam/Phaseo/pull/728) [`f37856b`](https://github.com/phaseoteam/Phaseo/commit/f37856b1792e9d9b821e3e7cdb50a4712a14dce3) Thanks [@dependabot](https://github.com/apps/dependabot)! - Align React and React DOM package versions in the devtools viewer dependency set.

- [#1042](https://github.com/phaseoteam/Phaseo/pull/1042) [`9e3749b`](https://github.com/phaseoteam/Phaseo/commit/9e3749bfdd06b2d10278787f7c0cfa67cfa4a56a) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden OAuth and gateway-adjacent data access, webhook SSRF validation, error serialization, local credential handling, dependency security, and database RPC permissions following a repository-wide security audit.

## 0.2.1

### Patch Changes

- [#610](https://github.com/phaseoteam/Phaseo/pull/610) [`54e6640`](https://github.com/phaseoteam/Phaseo/commit/54e6640d8cd7a4062c54d47a9f8010b65273939f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Agent SDK devtools capture, expand TypeScript SDK high-level helpers for generated API operations, and extend devtools endpoint metadata for agent runs.

## 0.2.0

### Minor Changes

- [#201](https://github.com/phaseoteam/Phaseo/pull/201) [`31a2268`](https://github.com/phaseoteam/Phaseo/commit/31a226829939099401558cb206890d9fede74495) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Minor Devtools Viewer release with UX and debugging improvements:
  - Persist selected generation in URL query state.
  - Prefer gateway request IDs in viewer display and lookup handling.
  - Improve response detail rendering with structured, readable output sections.
  - Refine sidebar/header/status styling and refresh behavior.
  - Add robust token/cost fallbacks from response usage/pricing breakdown when metadata is partial.

## 0.1.1

### Patch Changes

- [#47](https://github.com/phaseoteam/Phaseo/pull/47) [`3d6f643`](https://github.com/phaseoteam/Phaseo/commit/3d6f64336d20794c6f44c16a0f04cbf325ebdbdf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bundle devtools core primitives directly into the TypeScript SDK and devtools viewer so runtime installs no longer depend on `@phaseo/devtools-core`.

  Also harden publish reliability by validating `NPM_TOKEN` in CI and fixing Python `pyproject.toml` version sync.
