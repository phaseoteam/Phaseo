# @phaseo/docs

## 1.0.2

### Patch Changes

- [#2684](https://github.com/phaseoteam/Phaseo/pull/2684) [`b952403`](https://github.com/phaseoteam/Phaseo/commit/b952403ba791e43e909a5932dc652c8a4201b8ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Lower Enterprise pricing to $29/month for up to 100 workspace members and $79/month at 1,000 members. Allow smaller teams to subscribe, clarify membership-based allowances, and let Statsig control self-service rollout without an internal-admin restriction. Existing subscriptions and credit top-up fees remain unchanged.

- [#2825](https://github.com/phaseoteam/Phaseo/pull/2825) [`8c8af3b`](https://github.com/phaseoteam/Phaseo/commit/8c8af3bdf3ec12adfaec1f3304f3129ddaf6b19d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Providers declare the request and token limits they impose on Phaseo, provider-wide or per upstream model, through an optional `rate_limits` section in their catalogue feed or the new Rate limits section in provider settings. Limits apply without review once the provider is approved, and the gateway picks up changes as soon as the catalogue revision moves instead of waiting for its configuration TTL.

## 1.0.1

### Patch Changes

- [#2225](https://github.com/phaseoteam/Phaseo/pull/2225) [`102e87b`](https://github.com/phaseoteam/Phaseo/commit/102e87beae0d7b885ac773782c38e9832157818e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Limit batch result downloads to ten attempts per workspace and batch in a rolling thirty-minute window, with Retry-After responses and shared global admission.

- [#1662](https://github.com/phaseoteam/Phaseo/pull/1662) [`6de47c7`](https://github.com/phaseoteam/Phaseo/commit/6de47c70ebddd779ddda7da8d97a6052d74be3ae) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add automatic, integration-specific API-key provisioning for coding-agent setup, add DeepSeek Harness configuration support, and accept the documented Chat Completions `store` parameter required by Harness.

- [#2224](https://github.com/phaseoteam/Phaseo/pull/2224) [`013b172`](https://github.com/phaseoteam/Phaseo/commit/013b17260c5745a320bf6f167017fedae52fe641) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Use one OpenAPI specification for documentation and SDKs, publish Video and Batch endpoint references with Beta labels, and complete sidebar icons on main documentation pages while preserving OpenAPI reference styling.
  
  Organise the API Reference into six task-based sections. Consolidate duplicate guides with redirects, simplify onboarding and integration indexes, and correct stale authentication, streaming, and retry guidance.

## 1.0.0

### Major Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Align the web app, docs, and AI SDK provider with the coordinated major release.

  This captures breaking/structural updates tied to the gateway and SDK overhaul,
  including endpoint surface changes and updated integration expectations.

### Patch Changes

- [`f610264`](https://github.com/phaseoteam/Phaseo/commit/f6102647107d57ff8e4292ffcab57109fe6c92b7) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Update gateway and docs for recent API changes and documentation fixes.

## 0.2.0

### Minor Changes

- [#8](https://github.com/phaseoteam/Phaseo/pull/8) [`144dad5`](https://github.com/phaseoteam/Phaseo/commit/144dad5cbf8f56b0e1d987b0eafb9d0be5a98d5e) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Updated the documentation to reflect the Gateway API and SDK schema changes introduced in API v0.2.0.

## 0.1.2

### Patch Changes

- [#6](https://github.com/phaseoteam/Phaseo/pull/6) [`4322886`](https://github.com/phaseoteam/Phaseo/commit/4322886327dde92030846969718c9131a2a30431) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add latest updates to Changelog

## 0.1.1

### Patch Changes

- [`d322b30`](https://github.com/phaseoteam/Phaseo/commit/d322b30bbe33cde56ca80f17c5612c4609d58f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add New Changelog entries
