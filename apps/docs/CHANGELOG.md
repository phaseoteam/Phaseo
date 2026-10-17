# @phaseo/docs

## 1.1.0

### Minor Changes

- [#2947](https://github.com/phaseoteam/Phaseo/pull/2947) [`0166d62`](https://github.com/phaseoteam/Phaseo/commit/0166d6279098fc6b9aaa17fcc8e61d98010647e8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Make the docs agent-native: site-wide agent instructions in every page's Markdown and llms.txt, the 11 public Phaseo skills published on the docs site (`npx skills add https://phaseo.app/docs`), copyable prompts for coding agents, agent-only rules on the quickstart, errors, parameters and rate limits pages, more AI options in the page menu, and Mermaid diagrams, file trees and tooltips, all in nine languages.

- [#2930](https://github.com/phaseoteam/Phaseo/pull/2930) [`c093883`](https://github.com/phaseoteam/Phaseo/commit/c09388376c9dc67290ddd6f71cbdac9ff4d1ae48) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Redesign the docs to match phaseo.app: Luma theme with a one-row header and rounded-md buttons, Montserrat and the site's colours, a one-line footer with the Models, Status and Support links that used to be in the header, wider page content and one-line sidebar titles on large screens, and a new home page with a working first request. List small API Reference groups' endpoints directly and group the Python SDK pages like the other SDKs.

### Patch Changes

- [#2861](https://github.com/phaseoteam/Phaseo/pull/2861) [`2b77a4d`](https://github.com/phaseoteam/Phaseo/commit/2b77a4dbbf6a11833a28ae1fd7b0327d784ccdf3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - English API reference pages show English descriptions again instead of Arabic, and the "Get API Key" buttons and quickstart links open the API keys page instead of a 404. Translated docs pages that had dropped sections, stale code examples, broken formatting, or untranslated English now match the English pages, and the Hindi docs read as Hindi rather than a mix of Hindi and English.

- [#2901](https://github.com/phaseoteam/Phaseo/pull/2901) [`40e0a1b`](https://github.com/phaseoteam/Phaseo/commit/40e0a1bbc228d41c6b6cf12cf6ef551954f851a6) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Repair corrupted and mistranslated settings text in Arabic, Japanese, Portuguese, Spanish, Chinese and Hindi, and use one set of terms across the Hindi web app and docs. Spanish and German now address the reader informally throughout (tú, du), and Chinese uses 你, matching the docs. The translated help centre now describes Stripe receipts, as the English does, and its settings paths use the menu names each language shows. Provider catalog errors that fell back to a generic message now show their real reason. The OAuth app delete dialog and the management key notice read correctly in every language, and the C# Agent SDK quickstart uses the right namespace. `validate:i18n` now rejects HTML entities, Latin-script words that are not in the English source, Simplified Chinese characters in Japanese, and German Sie or Chinese 您.

- [#2866](https://github.com/phaseoteam/Phaseo/pull/2866) [`d554346`](https://github.com/phaseoteam/Phaseo/commit/d5543463264320b88ccb31e6352b435a74ef5281) Thanks [@DanielButler1](https://github.com/DanielButler1)! - The guardrail editor no longer shows the Budget Policies section. Guardrail request and spend limits were saved but never enforced, so they are hidden until per-key, member and department rate limits replace them. Saving a guardrail keeps any values it already has. The guardrail API reference and cookbook now say that the `budgets` field has no effect and point to API key limits and workspace budgets instead.

- [#2904](https://github.com/phaseoteam/Phaseo/pull/2904) [`6388cf2`](https://github.com/phaseoteam/Phaseo/commit/6388cf2d0007240446fc5df8f705feeb2537d7c3) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add verified Java source-install guides, corrected JSON examples, streaming instructions, and language selection across the documentation and model quickstarts. Cover Java streaming and local HTTP behavior with deterministic tests, and add CMake build and test support for the C++ preview. Keep C++ out of the published SDK menu until its HTTP transport and streaming support are ready.
  
  Use tested Java HTTP multipart examples for file uploads, audio transcription and translation, and image edits until the SDK supports multipart encoding. Verify the documented requests against a local multipart parser in CI.

- [#2864](https://github.com/phaseoteam/Phaseo/pull/2864) [`6fde6ac`](https://github.com/phaseoteam/Phaseo/commit/6fde6aca0eb81aa5a68146d2d345a3c61bc44f14) Thanks [@DanielButler1](https://github.com/DanielButler1)! - API key request and spend limits and workspace budgets now send `Retry-After` with their `429`, set to the seconds until the limit's window resets. Limits that never reset by themselves, such as lifetime budgets and soft-blocked keys, still omit it. The rate limits page now lists the requests-per-minute allowance for each workspace standing instead of a single 25 requests per minute.

- [#2684](https://github.com/phaseoteam/Phaseo/pull/2684) [`b952403`](https://github.com/phaseoteam/Phaseo/commit/b952403ba791e43e909a5932dc652c8a4201b8ad) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Lower Enterprise pricing to $29/month for up to 100 workspace members and $79/month at 1,000 members. Allow smaller teams to subscribe, clarify membership-based allowances, and let Statsig control self-service rollout without an internal-admin restriction. Existing subscriptions and credit top-up fees remain unchanged.

- [#2916](https://github.com/phaseoteam/Phaseo/pull/2916) [`d6f8d0a`](https://github.com/phaseoteam/Phaseo/commit/d6f8d0a5be5eed5b92fe43faf30b7e5704145f3c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add a weak `ETag` (`W/"…"`) to `GET /v1/models` JSON and OpenAI-format responses and answer a matching `If-None-Match` with a body-less `304`, which saves transfer and parsing when clients poll the model list. The `ETag` ignores `gateway_region`, which is why it is weak. Each model offer now lists the `service_tiers` its provider route accepts (`flex`, `priority`, `standard`, `ultrafast`), derived from the same executable pricing the gateway uses (current, USD, with a billable meter); prices stay standard-tier.

- [#2825](https://github.com/phaseoteam/Phaseo/pull/2825) [`8c8af3b`](https://github.com/phaseoteam/Phaseo/commit/8c8af3bdf3ec12adfaec1f3304f3129ddaf6b19d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Providers declare the request and token limits they impose on Phaseo, provider-wide or per upstream model, through an optional `rate_limits` section in their catalogue feed or the new Rate limits section in provider settings. Limits apply without review once the provider is approved, and the gateway picks up changes as soon as the catalogue revision moves instead of waiting for its configuration TTL.

- [#2850](https://github.com/phaseoteam/Phaseo/pull/2850) [`4deb866`](https://github.com/phaseoteam/Phaseo/commit/4deb8669706b0a398518fcfeeda199905887f520) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Routing eases traffic off a provider as it approaches a declared rate limit instead of switching it off at the limit. The limit coordinator projects each window's use from what isolates report they have used, and shortens leases near a limit so unused allowance is returned sooner. This removes the per-minute traffic swings and most of the requests that were sent over a limit.

- [#2888](https://github.com/phaseoteam/Phaseo/pull/2888) [`dafbc58`](https://github.com/phaseoteam/Phaseo/commit/dafbc580dcda55d340613949c80939763f07215d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for named rate limit policies (requests per minute, tokens per minute, concurrent requests) and their assignments to API keys, members, departments, guardrails, or the workspace's end-user default, with new `rate_limits:read`, `rate_limits:write`, and `rate_limits:delete` scopes. The gateway does not enforce these policies yet. API keys can now be linked to a department with `department_id`. The guardrail request and spend limit fields, which were never enforced, are marked deprecated.

- [#2893](https://github.com/phaseoteam/Phaseo/pull/2893) [`063fae4`](https://github.com/phaseoteam/Phaseo/commit/063fae4b5e572ec99a3b898c0e16de5b8df8f2cf) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Enforce the requests-per-minute limit of workspace rate limit policies assigned to API keys, members, guardrails and the end-user default. A rejected request returns `429` with the `rate_limit_exceeded` code, the policy ID and limit scope, and `Retry-After`; responses a policy applies to carry approximate `x-ratelimit-*-requests` headers. Policy changes are published to the gateway and take effect within about a minute, rotated keys keep their policy, and response cache hits are not counted. Tokens per minute, concurrent requests and department assignments are not enforced yet.

- [#2946](https://github.com/phaseoteam/Phaseo/pull/2946) [`105d6d2`](https://github.com/phaseoteam/Phaseo/commit/105d6d28d5947798db8f6013034cfd0f300047ff) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `rate_limit_throttled` notification event. Workspaces that route it to a destination get at most one alert an hour when rate limit policies reject requests, with the total over the last 15 minutes and the most-rejected policies.

- [#2858](https://github.com/phaseoteam/Phaseo/pull/2858) [`6f98576`](https://github.com/phaseoteam/Phaseo/commit/6f985766f09ad3c626a3a3fdbcb65b265663c181) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Honour the request-level `models` fallback list on every inference endpoint. `model` stays required and is the primary model; the optional `models` array lists up to 25 fallbacks tried in order when an attempt fails with `429`, `500`, `502`, `503`, or `504`. Each fallback reruns the full pipeline, and logs, usage, billing and the response `model` reflect the model that served the request. Streams fall back only before the first byte, and video and music jobs only at submission. Realtime sessions, batches and council runs reject `models` with a `400` instead of ignoring it.

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
