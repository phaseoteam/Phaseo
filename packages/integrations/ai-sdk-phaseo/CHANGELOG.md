# @phaseo/ai-sdk-provider

## 2.0.0

### Major Changes

- [#1336](https://github.com/phaseoteam/Phaseo/pull/1336) [`cdead00`](https://github.com/phaseoteam/Phaseo/commit/cdead00aa8fbac04b3e6f9008afb6260a41cfb91) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Migrate the default Phaseo provider to AI SDK 7's native Provider v4 contracts for language, embeddings, images, transcription, and speech. Forward AI SDK 7 reasoning settings and support its tagged file-data inputs. AI SDK 6 remains available on the Phaseo provider 1.x maintenance line.

### Patch Changes

- [#1488](https://github.com/phaseoteam/Phaseo/pull/1488) [`884620f`](https://github.com/phaseoteam/Phaseo/commit/884620fb27d03addda84aa76d67d8752b67d255f) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the AI SDK provider Node requirement with AI SDK 7, harden malformed catalogue 404 paths, and correct catalogue manifest and importer-state validation gaps.

- [#2053](https://github.com/phaseoteam/Phaseo/pull/2053) [`7492964`](https://github.com/phaseoteam/Phaseo/commit/7492964f199b192af28240fddf072bb0a5820277) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Run the AI SDK 7 unit, compatibility, example, and package checks in the release path, and align coding-harness setup guidance with the CLI's configuration-only behavior.

- [#2053](https://github.com/phaseoteam/Phaseo/pull/2053) [`7492964`](https://github.com/phaseoteam/Phaseo/commit/7492964f199b192af28240fddf072bb0a5820277) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add native AI SDK 7 reranking support through Phaseo's `/v1/rerank` endpoint.

## 1.0.1

### Patch Changes

- [#47](https://github.com/phaseoteam/Phaseo/pull/47) [`3d6f643`](https://github.com/phaseoteam/Phaseo/commit/3d6f64336d20794c6f44c16a0f04cbf325ebdbdf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Bundle devtools core primitives directly into the TypeScript SDK and devtools viewer so runtime installs no longer depend on `@phaseo/devtools-core`.

  Also harden publish reliability by validating `NPM_TOKEN` in CI and fixing Python `pyproject.toml` version sync.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the web app, docs, and AI SDK provider with the coordinated major release.

  This captures breaking/structural updates tied to the gateway and SDK overhaul,
  including endpoint surface changes and updated integration expectations.

### Minor Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update AI SDK provider tests and release readiness for the latest gateway models.
