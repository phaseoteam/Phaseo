# @phaseo/web-api

## 0.3.0

### Minor Changes

- [#1557](https://github.com/phaseoteam/Phaseo/pull/1557) [`da95013`](https://github.com/phaseoteam/Phaseo/commit/da9501340bcde7c9ad851f3e26e6c9848625f950) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add model pricing history, tier-aware effective pricing, and synchronized provider inspection.

- [#1314](https://github.com/phaseoteam/Phaseo/pull/1314) [`7a37f89`](https://github.com/phaseoteam/Phaseo/commit/7a37f8956c26affcaa792ecfbac445bf0c90f218) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add key-scoped dynamic routing flows, searchable model selection with ordered model and provider fallbacks, provider-health suggestions, and 15-minute cache-aware plus session-aware provider affinity.

### Patch Changes

- [#1266](https://github.com/phaseoteam/Phaseo/pull/1266) [`0674f8b`](https://github.com/phaseoteam/Phaseo/commit/0674f8b85f05f707a423d69c1e368be9b020cafc) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add explicit previous, next, and family navigation to model About sections, attach model licence sources directly to licence metadata, modernise dedicated family pages with recent-first ordering, consolidate codename variants into their canonical generation families, and enforce model lineage integrity during catalog validation.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Record normalized request client attribution, declare official SDK identities, and show request sources in workspace usage logs.

- [#1484](https://github.com/phaseoteam/Phaseo/pull/1484) [`6a6e243`](https://github.com/phaseoteam/Phaseo/commit/6a6e24367329cc959dd21939855f38439edaa9aa) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Prevent cross-site cookie sessions from being upgraded to bearer credentials by the web proxy, and require explicit persistence for workspace selection.

- [#1474](https://github.com/phaseoteam/Phaseo/pull/1474) [`a46ed42`](https://github.com/phaseoteam/Phaseo/commit/a46ed42a1d9473cd4a75f50bd5e767cfc2fa95e5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Reject unsupported public pricing query parameters and fail closed when provider routes exceed the bounded catalogue scan.

- [#1529](https://github.com/phaseoteam/Phaseo/pull/1529) [`ecfc043`](https://github.com/phaseoteam/Phaseo/commit/ecfc04377cbaf19285e3747368dccb6240d875e8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a public image and audio provenance checker backed by OpenAI, surface verification guidance on relevant model pages, and reorganise the public tools collection.

- [#1509](https://github.com/phaseoteam/Phaseo/pull/1509) [`ea170b2`](https://github.com/phaseoteam/Phaseo/commit/ea170b2db3c4328f80eabcac97d2d81ddf895da2) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add inherited provider and route geographic availability policies, request-origin country and subdivision enforcement, published upstream restrictions for OpenAI, Anthropic, Gemini API, ElevenLabs, Z.AI, and LongCat, fallback diagnostics, and a dedicated unavailable-region API response. Require users to confirm their location and acknowledge the displayed restrictions before purchasing credits, serve the creator-branded model preview through a short-lived edge-cached web API projection, and collect full billing addresses for new-card checkouts.

- [#1726](https://github.com/phaseoteam/Phaseo/pull/1726) [`cf23c53`](https://github.com/phaseoteam/Phaseo/commit/cf23c53607002cdbf32cd59723efe8b369791c20) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Order upstream request attempts newest-first in usage logs.

- [#1723](https://github.com/phaseoteam/Phaseo/pull/1723) [`bc4d4f3`](https://github.com/phaseoteam/Phaseo/commit/bc4d4f318efdc30c5ad4055960738347f894c908) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep Phaseo Chat in App attribution and enforce an exhaustive Source taxonomy for Direct HTTP, SDKs, agent SDKs, coding agents, and recognized HTTP clients.

- [#1721](https://github.com/phaseoteam/Phaseo/pull/1721) [`1559d64`](https://github.com/phaseoteam/Phaseo/commit/1559d6495adf3fa7e08f1ad1372e0c928ef465c5) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add optional user-defined app attribution while keeping SDK client identity separate from workspace apps.

- [#1481](https://github.com/phaseoteam/Phaseo/pull/1481) [`60ef821`](https://github.com/phaseoteam/Phaseo/commit/60ef82193a9fc9a40d98cb7674afef420a278900) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Filter provider app telemetry against authoritative public-app visibility before returning it.

- [#1718](https://github.com/phaseoteam/Phaseo/pull/1718) [`b00c31d`](https://github.com/phaseoteam/Phaseo/commit/b00c31da51f6cfc3c28a0593b937a984bef7a8e4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Keep production chat requests on the configured production gateway even when a browser has a staging target stored locally.

- [#1486](https://github.com/phaseoteam/Phaseo/pull/1486) [`de52182`](https://github.com/phaseoteam/Phaseo/commit/de521823fed38c17d99f35ad576f4810b45b68bf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Invalidate cached gateway contexts immediately when response-healing workspace policy changes.

- [#1758](https://github.com/phaseoteam/Phaseo/pull/1758) [`06ba3d1`](https://github.com/phaseoteam/Phaseo/commit/06ba3d15134ab82dba4e275cdf52ea4cb9418273) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider datacenter filtering and align the Providers table controls with the Models page.

## 0.2.0

### Minor Changes

- [#1172](https://github.com/phaseoteam/Phaseo/pull/1172) [`506bd06`](https://github.com/phaseoteam/Phaseo/commit/506bd066513418f19dd4c20b73b98637f035742b) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Expose the asynchronous video API and playground behind coordinated, fail-closed rollout gates while preserving access to already accepted jobs.
