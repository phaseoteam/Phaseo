# @phaseo/web-api

## 0.3.0

### Minor Changes

- [#1314](https://github.com/phaseoteam/Phaseo/pull/1314) [`7a37f89`](https://github.com/phaseoteam/Phaseo/commit/7a37f8956c26affcaa792ecfbac445bf0c90f218) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add key-scoped dynamic routing flows, searchable model selection with ordered model and provider fallbacks, provider-health suggestions, and 15-minute cache-aware plus session-aware provider affinity.

### Patch Changes

- [#1266](https://github.com/phaseoteam/Phaseo/pull/1266) [`0674f8b`](https://github.com/phaseoteam/Phaseo/commit/0674f8b85f05f707a423d69c1e368be9b020cafc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit previous, next, and family navigation to model About sections, attach model licence sources directly to licence metadata, modernise dedicated family pages with recent-first ordering, consolidate codename variants into their canonical generation families, and enforce model lineage integrity during catalog validation.

- [#1484](https://github.com/phaseoteam/Phaseo/pull/1484) [`6a6e243`](https://github.com/phaseoteam/Phaseo/commit/6a6e24367329cc959dd21939855f38439edaa9aa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent cross-site cookie sessions from being upgraded to bearer credentials by the web proxy, and require explicit persistence for workspace selection.

- [#1474](https://github.com/phaseoteam/Phaseo/pull/1474) [`a46ed42`](https://github.com/phaseoteam/Phaseo/commit/a46ed42a1d9473cd4a75f50bd5e767cfc2fa95e5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject unsupported public pricing query parameters and fail closed when provider routes exceed the bounded catalogue scan.

- [#1481](https://github.com/phaseoteam/Phaseo/pull/1481) [`60ef821`](https://github.com/phaseoteam/Phaseo/commit/60ef82193a9fc9a40d98cb7674afef420a278900) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Filter provider app telemetry against authoritative public-app visibility before returning it.

- [#1486](https://github.com/phaseoteam/Phaseo/pull/1486) [`de52182`](https://github.com/phaseoteam/Phaseo/commit/de521823fed38c17d99f35ad576f4810b45b68bf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Invalidate cached gateway contexts immediately when response-healing workspace policy changes.

## 0.2.0

### Minor Changes

- [#1172](https://github.com/phaseoteam/Phaseo/pull/1172) [`506bd06`](https://github.com/phaseoteam/Phaseo/commit/506bd066513418f19dd4c20b73b98637f035742b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose the asynchronous video API and playground behind coordinated, fail-closed rollout gates while preserving access to already accepted jobs.
