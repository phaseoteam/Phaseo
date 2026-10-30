# @phaseo/cli

## 0.4.0

### Minor Changes

- [#3321](https://github.com/phaseoteam/Phaseo/pull/3321) [`536e25f`](https://github.com/phaseoteam/Phaseo/commit/536e25f8e949887cca1ea8fa582d89fdf2854ba1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add human-confirmed credit top-ups for agents. `POST /v1/credits/topups` (beta) starts a $5 to $500 top-up and `GET /v1/credits/topups/{id}` reports its status, with a `final` flag and a `reason` code for declined, expired and failed top-ups. Nothing is charged by the API: with a saved card, every workspace owner and admin is emailed a single-use link to a review page where one of them confirms (with 3D Secure when the bank asks) or declines; without one, the response has a link where an owner or admin pays with a new card through the existing checkout, which saves it for later top-ups. Requests expire after 30 minutes and a workspace can have 5 pending. The new `billing:write` scope is opt-in: it is not a default CLI login scope or management-key scope. The CLI adds `phaseo credits add --amount <usd>` and `phaseo credits topups get <id>`, and `phaseo login --scopes billing:write` keeps the default scopes and adds it.

- [#3345](https://github.com/phaseoteam/Phaseo/pull/3345) [`b200d01`](https://github.com/phaseoteam/Phaseo/commit/b200d01ad4c3386dbd1012117ad243ed3161cb1c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add `phaseo fx`, which sets up Vercel Labs' fx coding agent with Phaseo. It installs fx with the official installer after confirmation, adds a `phaseo` connection to `~/.fx/settings.json` with up to 256 compatible models, and makes Phaseo the active fx provider. The dedicated key goes to the owner-only `~/.config/phaseo/integrations/fx.env`, which a one-line shell-profile entry loads because fx reads connection keys only from environment variables. `phaseo integrations remove fx` restores the previous provider, deletes the key file and revokes the key.

- [#3312](https://github.com/phaseoteam/Phaseo/pull/3312) [`11ef350`](https://github.com/phaseoteam/Phaseo/commit/11ef35053208bd50a255487d1c4bc792d858d64d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add dedicated `phaseo` commands for the remaining `/v1` management routes: `byok`, `budgets`, `department-budgets`, `spend-rules`, `spend-blocks`, `rate-limits`, `observability`, `notifications`, `routing dynamic-routes`, `private-models`, `classifiers`, `identity`, `workload-identity`, `audit-events`, `apps`, `feedback`, `preset-test-runs`, plus preset versions, labels, fork, upstream and publisher, and workspace invites, join requests and member roles. Secrets come from stdin or the environment, never argv. Destructive commands ask for confirmation or need `--yes`.

- [#3323](https://github.com/phaseoteam/Phaseo/pull/3323) [`5e66c83`](https://github.com/phaseoteam/Phaseo/commit/5e66c8383fd30ab5a1fba17738df19a7a4d064b4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add `POST /v1/classifiers/test`, which runs a saved or draft request classifier once on a sample, the same way as the dashboard's test. It makes a real, billed model request with the caller's own credential and labels it `phaseo.classifier_test`. The credential must have `classifiers:write` and `gateway:access`. Management keys are refused, and no key is ever created for the caller.
  
  The CLI gains commands for the routes that replaced dashboard-only settings: `rate-limits tier get|raise`, `invites accept|requests`, `routing auto get|update`, `routing successors list|set|remove`, `observability destinations test|sample|test-config`, `authorized-apps list|revoke|update-scopes`, `profile get|update` and `classifiers test`. `keys update` also gains `--ip-allowlist`.
  
  The API reference now has pages for these routes in every docs language.

- [#3343](https://github.com/phaseoteam/Phaseo/pull/3343) [`9418cc2`](https://github.com/phaseoteam/Phaseo/commit/9418cc22c648ff97a9a0906c55ba034cb8c8bec4) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Security hardening: resolve package managers to absolute paths on Windows (also for `phaseo update`), require `--allow-custom-api-url` or `PHASEO_ALLOW_CUSTOM_API_URL=1` to sign in to a non-Phaseo API host and show that host in `whoami`, open server-supplied links only on https://phaseo.app, store the macOS session encrypted with a Keychain-held data key and keep it and the Hermes key out of process arguments, write Hermes' key as a delimited managed block in its .env (atomic, symlinks refused, other lines untouched), create integration keys with a 90-day expiry and a $100 monthly spend limit and replace expired ones, keep integration keys on re-login only for the same API, account and workspace (otherwise revoke them), and strip terminal control characters from server text in older list and detail views.

### Patch Changes

- [#3345](https://github.com/phaseoteam/Phaseo/pull/3345) [`b200d01`](https://github.com/phaseoteam/Phaseo/commit/b200d01ad4c3386dbd1012117ad243ed3161cb1c) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix model catalog sync for OpenCode, fx, DeepSeek Harness, Pi, Prime Agent and OpenClaw. The CLI filtered the catalog by `chat.completions`, which no current model advertises, so setup fell back to the default model only. It now filters by the gateway's `text.generate` capability and still accepts the older endpoint names.

- [#3382](https://github.com/phaseoteam/Phaseo/pull/3382) [`5fb5668`](https://github.com/phaseoteam/Phaseo/commit/5fb56689549ab431e3ad295a076b83e46e2173af) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Fix Hermes setup with current Hermes releases. Setup now sets Hermes' `model.key_env` to `OPENAI_API_KEY`; without it Hermes only sends that key to OpenAI's own hosts, so requests to Phaseo went out without a key. Setup asks Hermes where its `.env` is (`hermes config env-path`), falling back to `%LOCALAPPDATA%\hermes` on Windows and `~/.hermes` elsewhere, and moves a key an earlier version wrote to `~/.hermes/.env` on Windows. Removal keeps restoring the other settings and removes the key even if one setting fails, and the setup messages show the real file path.

- [#2888](https://github.com/phaseoteam/Phaseo/pull/2888) [`dafbc58`](https://github.com/phaseoteam/Phaseo/commit/dafbc580dcda55d340613949c80939763f07215d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for named rate limit policies (requests per minute, tokens per minute, concurrent requests) and their assignments to API keys, members, departments, guardrails, or the workspace's end-user default, with new `rate_limits:read`, `rate_limits:write`, and `rate_limits:delete` scopes. The gateway does not enforce these policies yet. API keys can now be linked to a department with `department_id`. The guardrail request and spend limit fields, which were never enforced, are marked deprecated.

- [#3029](https://github.com/phaseoteam/Phaseo/pull/3029) [`c8f3bca`](https://github.com/phaseoteam/Phaseo/commit/c8f3bcaebc6c6c6f37c5f32bef03852b3e5724f1) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add beta management endpoints for request classifiers (`/v1/classifiers`), with new `classifiers:read`, `classifiers:write`, and `classifiers:delete` scopes. A classifier is a workspace taxonomy of up to 12 dimensions, a model, optional instructions, a sample rate, an optional scope (keys, apps, models), and an optional monthly budget; up to 5 per workspace. The gateway does not run classifiers yet.

## 0.3.0

### Minor Changes

- [#1545](https://github.com/phaseoteam/Phaseo/pull/1545) [`9f33952`](https://github.com/phaseoteam/Phaseo/commit/9f339524a39eab3a58e7270f02c09f0e68aca730) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add safe OpenCode provider setup, status, and removal commands.

- [#2336](https://github.com/phaseoteam/Phaseo/pull/2336) [`a8520c2`](https://github.com/phaseoteam/Phaseo/commit/a8520c275c5f555bf54f52ffc81c3720add461a8) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add the `phaseo minimax` runner for MiniMax Code with official CLI installation, temporary Phaseo provider configuration, compatible model-catalog sync, and integration documentation.

- [#2086](https://github.com/phaseoteam/Phaseo/pull/2086) [`b70d520`](https://github.com/phaseoteam/Phaseo/commit/b70d520f07d879ce124c87570ae91b2f08f8bcb9) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add provider credential lifecycle, filtering, routing-mode, and ordering operations.

- [#1662](https://github.com/phaseoteam/Phaseo/pull/1662) [`6de47c7`](https://github.com/phaseoteam/Phaseo/commit/6de47c70ebddd779ddda7da8d97a6052d74be3ae) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add automatic, integration-specific API-key provisioning for coding-agent setup, add DeepSeek Harness configuration support, and accept the documented Chat Completions `store` parameter required by Harness.

- [#1685](https://github.com/phaseoteam/Phaseo/pull/1685) [`daa0275`](https://github.com/phaseoteam/Phaseo/commit/daa02757701eae300a06870a4817df60dd94e28d) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add one-command installation and setup for the primary coding harnesses, including consent-gated installation prompts, direct `phaseo <harness>` shortcuts, compatible model-catalog sync, and automatic credential handling.

- [#1510](https://github.com/phaseoteam/Phaseo/pull/1510) [`1149720`](https://github.com/phaseoteam/Phaseo/commit/114972048479d7f78a1e167d080df90299af8693) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add secure Codex and Claude Code gateway configuration commands.

### Patch Changes

- [#2325](https://github.com/phaseoteam/Phaseo/pull/2325) [`cdbfd06`](https://github.com/phaseoteam/Phaseo/commit/cdbfd0651fdf8af1bd97b60e4e2e2d3187c4cf60) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Add Ori-compatible Phaseo CLI runners for Cline, Kilo Code, oh-my-pi, and Muse Code with isolated provider configuration, dedicated credentials, model selection, installation prompts, and dry-run previews.

- [#1812](https://github.com/phaseoteam/Phaseo/pull/1812) [`8aea1ef`](https://github.com/phaseoteam/Phaseo/commit/8aea1ef77d37fdb919418d54c40ad5914cb0da71) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Preserve integration credential revocation metadata across session refreshes and require coding harnesses to be installed manually from trusted releases.

- [#2053](https://github.com/phaseoteam/Phaseo/pull/2053) [`7492964`](https://github.com/phaseoteam/Phaseo/commit/7492964f199b192af28240fddf072bb0a5820277) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Run the AI SDK 7 unit, compatibility, example, and package checks in the release path, and align coding-harness setup guidance with the CLI's configuration-only behavior.

- [#2328](https://github.com/phaseoteam/Phaseo/pull/2328) [`708d1b9`](https://github.com/phaseoteam/Phaseo/commit/708d1b9f488c77217554b31ee30e963db60fe9ac) Thanks [@DanielButler1](https://github.com/DanielButler1)! - Harden pricing, batch credentials and downloads, directory administration, telemetry privacy, public metadata, release tooling, and catalogue routing against the latest cloud security findings.

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
