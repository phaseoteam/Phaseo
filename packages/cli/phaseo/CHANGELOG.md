# @phaseo/cli

## 0.3.0

### Minor Changes

- [#1545](https://github.com/phaseoteam/Phaseo/pull/1545) [`9f33952`](https://github.com/phaseoteam/Phaseo/commit/9f339524a39eab3a58e7270f02c09f0e68aca730) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add safe OpenCode provider setup, status, and removal commands.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider credential lifecycle, filtering, routing-mode, and ordering operations.

- [#1662](https://github.com/phaseoteam/Phaseo/pull/1662) [`6de47c7`](https://github.com/phaseoteam/Phaseo/commit/6de47c70ebddd779ddda7da8d97a6052d74be3ae) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add automatic, integration-specific API-key provisioning for coding-agent setup, add DeepSeek Harness configuration support, and accept the documented Chat Completions `store` parameter required by Harness.

- [#1685](https://github.com/phaseoteam/Phaseo/pull/1685) [`daa0275`](https://github.com/phaseoteam/Phaseo/commit/daa02757701eae300a06870a4817df60dd94e28d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add one-command installation and setup for the primary coding harnesses, including consent-gated installation prompts, direct `phaseo <harness>` shortcuts, compatible model-catalog sync, and automatic credential handling.

- [#1510](https://github.com/phaseoteam/Phaseo/pull/1510) [`1149720`](https://github.com/phaseoteam/Phaseo/commit/114972048479d7f78a1e167d080df90299af8693) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add secure Codex and Claude Code gateway configuration commands.

### Patch Changes

- [#1812](https://github.com/phaseoteam/Phaseo/pull/1812) [`8aea1ef`](https://github.com/phaseoteam/Phaseo/commit/8aea1ef77d37fdb919418d54c40ad5914cb0da71) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve integration credential revocation metadata across session refreshes and require coding harnesses to be installed manually from trusted releases.

- [#2053](https://github.com/phaseoteam/Phaseo/pull/2053) [`7492964`](https://github.com/phaseoteam/Phaseo/commit/7492964f199b192af28240fddf072bb0a5820277) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Run the AI SDK 7 unit, compatibility, example, and package checks in the release path, and align coding-harness setup guidance with the CLI's configuration-only behavior.

## 0.2.3

### Patch Changes

- [#1538](https://github.com/phaseoteam/Phaseo/pull/1538) [`cb766c7`](https://github.com/phaseoteam/Phaseo/commit/cb766c71a205d06adbdae7cb44f9c0439a99d65c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the plain browser-login callback with branded, responsive success, waiting, and denial states.

## 0.2.2

### Patch Changes

- [#1536](https://github.com/phaseoteam/Phaseo/pull/1536) [`b7cb1b9`](https://github.com/phaseoteam/Phaseo/commit/b7cb1b9bac60aeabcbcefd0c495e8a27b073ad66) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Stop CLI login from requesting unsupported feedback scopes, and keep the first-party scope set explicit so new control-plane capabilities cannot silently break authentication.

## 0.2.1

### Patch Changes

- [#1534](https://github.com/phaseoteam/Phaseo/pull/1534) [`af6be51`](https://github.com/phaseoteam/Phaseo/commit/af6be51554e6c21abc0741dedb47a9978cf182c2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add installation-aware `update` and `doctor` commands, including PATH shadowing diagnostics, package-manager-specific remediation, and reliable POSIX installation detection.

## 0.2.0

### Minor Changes

- [#1531](https://github.com/phaseoteam/Phaseo/pull/1531) [`89d937e`](https://github.com/phaseoteam/Phaseo/commit/89d937efad68dfdb6ccd2ce8c7482be9897eddfb) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Replace the legacy models response with the Phaseo-native catalogue, including lifecycle, modality, token-limit, capability, availability, pricing, and provider-offer data.

  Improve command guidance with scoped group help, actionable unknown-command errors, a `v` version alias, published-version checks, and sanitized catalogue output.

### Patch Changes

- [#1286](https://github.com/phaseoteam/Phaseo/pull/1286) [`7be11cd`](https://github.com/phaseoteam/Phaseo/commit/7be11cd461a2cb5243c8e5c3db376cdee879a113) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add CLI management for gated, explicitly consented data contribution settings.

## 0.1.2

### Patch Changes

- [#1032](https://github.com/phaseoteam/Phaseo/pull/1032) [`c8cd44c`](https://github.com/phaseoteam/Phaseo/commit/c8cd44cfcc7d6d48eb608dc19635266526a72468) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Require explicit gateway consent before third-party OAuth can mint or use a user-funded delegated key, revoke previously issued low-scope keys, make the inference permission clear in the consent and client-management interfaces, and align refresh-token locking with immediate workspace revocation.

  Harden CLI OAuth token validation, local credential storage, Windows authorization URL launching, one-time OAuth client secret output, and backwards-compatible key-cache invalidation during the Phaseo environment-variable transition.

- [#1244](https://github.com/phaseoteam/Phaseo/pull/1244) [`f75240d`](https://github.com/phaseoteam/Phaseo/commit/f75240da6b32ff1e20303b267f45ac3ee3abf5c7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Publish the native Phaseo CLI package and allow its scoped OAuth session to use catalogue, pricing, analytics, and generation read commands.

- [#972](https://github.com/phaseoteam/Phaseo/pull/972) [`75a2493`](https://github.com/phaseoteam/Phaseo/commit/75a2493decb405a29a1fa29348ce8d6da3d601de) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden CLI OAuth sessions, key-pepper rotation, redirect handling, and abuse controls while moving the CLI to `api.phaseo.app`.

  Add filtered, workspace-scoped, redacted request log listing and per-request inspection to the Phaseo CLI.

- [#1123](https://github.com/phaseoteam/Phaseo/pull/1123) [`8209df0`](https://github.com/phaseoteam/Phaseo/commit/8209df0ed6a72ecf06fddb1f5fa029d73b6b7a20) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Unify and harden Phaseo OAuth discovery, consent, identity, revocation, PKCE, protected-resource binding, and confidential MCP-to-API token exchange across the first-party CLI, user-created applications, and dynamically registered MCP clients.

## 0.1.1

### Patch Changes

- [#562](https://github.com/phaseoteam/Phaseo/pull/562) [`1809a4b`](https://github.com/phaseoteam/Phaseo/commit/1809a4b3d45f198ba9c5f8b079d8b00027aaf742) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden the CLI and OAuth app flows, add dedicated CLI CI coverage, and document the first public Phaseo CLI release surface.
