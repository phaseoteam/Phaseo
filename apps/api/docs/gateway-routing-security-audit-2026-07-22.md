# Gateway Routing Security Audit — 2026-07-22

## Remediation update

The implementation pass following this audit has resolved ROUTE-SEC-001, 002, 003, 004, 006, 007, 009, and 011:

- Full gateway/provider payloads now reach Supabase detail storage and R2 only when the workspace explicitly enables I/O logging and the feature gate is active. Operational billing/attempt metadata remains available without retaining prompts or outputs.
- One centralized URL sanitizer now protects attempt logs, transform snapshots, central error handling, detailed events, and Axiom output, including Google `?key=` credentials and common token/signature parameters.
- Workspace settings, billing mode, provider status, and BYOK hydration now fail closed when required source data cannot be loaded. Unknown provider/routing values normalize to non-routable states.
- Restrictive privacy settings reject unknown or unconfirmed provider policy metadata. ZDR-required traffic accepts only ZDR-by-default routes; merely optional ZDR is not treated as a guarantee.
- Request bodies are bounded before parsing (16 MiB JSON/urlencoded, 32 MiB multipart), with streamed over-limit requests cancelled and returned as HTTP 413. Upstream error inspection is capped at 32 KiB.
- The credential chain is priority BYOK, ranked managed providers, then fallback BYOK. The workspace fallback toggle controls the final section, and each actual attempt records its phase/key ID in `gateway_requests.provider_attempts` without storing plaintext keys.
- BYOK and privacy/guardrail settings changed in the Web UI now invalidate all active workspace key-context versions. The UI documents Cloudflare edge propagation and supports reordering keys within each provider/mode section.
- Decrypted BYOK byte buffers are cleared after conversion to the short-lived executor string.
- The previously failing pricing suite is repaired. The broader routing/security suite now passes 301/301 tests.

ROUTE-SEC-008 remains an explicitly documented Cloudflare KV propagation tradeoff. ROUTE-SEC-005 remains the deliberate product behavior of exhausting the allowed credential/provider chain; circuit breakers and `allow_fallbacks` remain hard controls. ROUTE-SEC-010 is maintenance hardening rather than a release blocker.

## Executive summary

The current gateway has a strong routing trust boundary under normal operating conditions:

- Authentication resolves the workspace from the verified API key; callers cannot supply a workspace ID.
- Workspace provider/model policies are intersected with request-level `provider.only` and `provider.ignore` controls before ranking.
- Workspace ZDR requirements are written into the effective routing request after preset merging, so a caller cannot weaken them.
- Ranking and fallback receive only the already-filtered provider candidates.
- BYOK records are queried by workspace, provider, key ID, and enabled state. Decrypted key material is added after the KV context cache is read or written, so plaintext BYOK values are not stored in the gateway context KV cache.
- Testing mode requires the high-entropy internal token. The performance Worker additionally restricts access to one configured workspace and an endpoint allowlist.

The system is not yet ready to be described as security-hardened or “rock solid.” This audit found **three high-severity findings**, **six medium-severity findings**, and **two low-severity hardening items**. The most urgent issues are sensitive payload persistence that bypasses the I/O logging opt-in, provider API keys leaking through logged upstream URLs, and fail-open privacy/provider-status enrichment.

No critical remote-authentication bypass or cross-workspace routing bypass was found.

## Scope

The review covered:

- API key and OAuth authentication, internal/test authentication, and workspace derivation.
- Context loading, L1/KV caching, cache invalidation, provider metadata, pricing, and workspace settings.
- Workspace and key guardrails, provider/model allowlists and blocklists, ZDR, training, and logging policies.
- `provider.only`, `provider.ignore`, ordering, residency, price caps, status gates, and capability gates.
- Cheap-first/Thompson routing, EWMA health, circuit breakers, exploration, sticky routing, and fallback.
- Ordered priority and fallback BYOK credentials and managed gateway credentials.
- Provider dispatch, upstream error processing, timing, audit persistence, and Axiom observability.
- Production and performance Worker configuration.

The review was performed against the dirty working tree on 2026-07-22. No runtime fixes were made as part of this audit.

## Findings

### High severity

#### ROUTE-SEC-001 — Full request and provider payloads are persisted independently of I/O logging consent

**Impact:** User prompts, model outputs, and provider-transformed payloads can be stored in Supabase even when workspace I/O logging is disabled, creating an unexpected sensitive-data retention surface.

The execute path always asks executors to return upstream request and response payloads:

- `apps/api/src/pipeline/execute/index.ts:653`
- `apps/api/src/pipeline/execute/index.ts:654`

The main audit path then inserts the complete gateway request, gateway response, provider request, and provider response into `gateway_request_details` on success and failure without consulting `io_logging_enabled`:

- `apps/api/src/pipeline/audit/index.ts:464`
- `apps/api/src/pipeline/audit/index.ts:477`
- `apps/api/src/pipeline/audit/index.ts:481`
- `apps/api/src/pipeline/audit/index.ts:482`
- `apps/api/src/pipeline/audit/index.ts:663`
- `apps/api/src/pipeline/audit/index.ts:765`

The separate R2 I/O logger does fail closed and respects its workspace setting, but that protection does not cover `gateway_request_details`.

**Required remediation:** Make detailed payload persistence use one authoritative workspace consent/retention policy. When disabled, persist only operational metadata and redacted summaries. Capture provider payloads only when needed for an enabled feature, and define deletion/retention behavior for existing rows.

#### ROUTE-SEC-002 — Provider credentials in query strings can be written to audit and Axiom URLs

**Impact:** Google AI Studio or BYOK credentials can be exposed to operators, log storage, or downstream observability systems.

Several Google integrations authenticate through `?key=...`, for example:

- `apps/api/src/providers/google-ai-studio/endpoints/chat.ts:801`
- `apps/api/src/providers/google-ai-studio/endpoints/responses.ts:129`
- `apps/api/src/providers/google-ai-studio/endpoints/images.ts:237`
- `apps/api/src/executors/google/embeddings/index.ts:316`
- `apps/api/src/executors/google/audio-speech/index.ts:181`

Provider-attempt diagnostics correctly call a URL-redaction helper, but the main audit transform stores the raw `Response.url`, and detailed Axiom events also use it directly:

- `apps/api/src/pipeline/after/audit.ts:225`
- `apps/api/src/observability/events.ts:1263`

**Required remediation:** Centralize URL sanitization and apply it before every log, audit, diagnostic, error, or response-metadata boundary. Redact at least `key`, `api_key`, `x-api-key`, `token`, `access_token`, `sig`, and `signature`; preferably retain only scheme, host, and pathname.

#### ROUTE-SEC-003 — Privacy settings and provider rollout status fail open when enrichment fails

**Impact:** During a cold-cache database/enrichment failure, a workspace requiring ZDR/no-training/no-logging can be routed using permissive defaults, and an administratively disabled provider can be treated as active.

Context enrichment begins with permissive defaults, including ZDR disabled and training/logging allowed:

- `apps/api/src/pipeline/before/context.ts:1143`
- `apps/api/src/pipeline/before/context.ts:1149`

Settings are applied only when the settings query has no error:

- `apps/api/src/pipeline/before/context.ts:1186`

The surrounding catch explicitly preserves defaults and does not block the request:

- `apps/api/src/pipeline/before/context.ts:1330`

Provider status fallback values are also `active` in context construction/enrichment:

- `apps/api/src/pipeline/before/context.ts:617`
- `apps/api/src/pipeline/before/context.ts:758`

Workspace/key provider and model guardrail loading is better: `beforeRequest` returns a gateway error when `fetchWorkspacePolicy` fails. The gap is specifically the privacy/team-settings and rollout-status enrichment path.

**Required remediation:** Separate security policy from optional enrichment. Load a versioned, last-known-good security-policy object. If neither fresh nor cached security policy is available, fail closed. Treat missing provider status/data-policy metadata as non-routable when a restrictive privacy control is active.

### Medium severity

#### ROUTE-SEC-004 — Unknown data-policy metadata is allowed under restrictive workspace controls

When logging or may-train permissions are disabled, `applyProviderDataPolicySettings` drops known `logs` and `trains` providers but permits providers whose policy tier is `unknown`:

- `apps/api/src/pipeline/before/workspacePolicy.ts:674`
- `apps/api/src/pipeline/before/workspacePolicy.ts:676`
- `apps/api/src/pipeline/before/workspacePolicy.ts:691`

ZDR itself is stricter: unknown ZDR metadata fails the residency requirement. The broader logging/training controls should use the same fail-closed principle.

**Remediation:** Under a restrictive privacy setting, exclude unknown or insufficient-confidence metadata unless the workspace explicitly opts into best-effort behavior.

#### ROUTE-SEC-005 — Any non-2xx can fan the same request across every provider and credential

The credential plan expands to priority BYOK keys for all ranked providers, then all managed credentials, then all fallback BYOK keys. The loop has no total-attempt ceiling other than the number of providers and configured keys:

- `apps/api/src/pipeline/execute/index.ts:84`
- `apps/api/src/pipeline/execute/index.ts:415`
- `apps/api/src/pipeline/execute/index.ts:418`

Every non-2xx response advances to the next entry:

- `apps/api/src/pipeline/execute/index.ts:838`

This matches the desired “exhaust every provider” behavior, but it also means non-retryable 400-class request errors can disclose the same prompt to many providers and amplify cost/traffic. With many BYOK keys, attempts can exceed the provider count substantially.

**Remediation:** Define an explicit status/error taxonomy. Continue on provider/credential/transient failures (for example transport errors, 408, 429, and selected 5xx); stop on request-shape and other deterministic caller errors. Add a configurable hard safety ceiling for total upstream dispatches while retaining all-provider fallback within that ceiling.

#### ROUTE-SEC-006 — Incoming bodies and upstream error bodies are buffered without explicit limits

Incoming JSON and form bodies are fully materialized without a gateway size guard:

- `apps/api/src/pipeline/before/guards.ts:222`
- `apps/api/src/pipeline/before/guards.ts:320`
- `apps/api/src/pipeline/before/guards.ts:327`

Upstream failure bodies are cloned and read in full before their preview is truncated:

- `apps/api/src/pipeline/execute/index.ts:254`
- `apps/api/src/pipeline/execute/index.ts:269`

This conflicts with Cloudflare’s guidance to stream or bound unknown payloads and creates memory/CPU denial-of-service risk.

**Remediation:** Enforce endpoint-specific request byte limits before parsing and use a bounded stream reader for upstream error previews. Abort reading after the diagnostic limit.

#### ROUTE-SEC-007 — The workspace BYOK fallback toggle is loaded but not enforced

`byok_fallback_enabled` is read into `teamSettings`:

- `apps/api/src/pipeline/before/context.ts:1175`
- `apps/api/src/pipeline/before/context.ts:1194`

It is not referenced by production execute code. The web action still exposes and updates it:

- `apps/web/src/app/(dashboard)/settings/byok/actions.ts:171`
- `apps/web/src/app/(dashboard)/settings/byok/actions.ts:181`

Per-key `priority` and `fallback` modes do work, but the workspace toggle currently gives an administrator a control that does not affect routing.

**Remediation:** Either remove/deprecate the toggle in favor of per-key routing modes, or enforce it when constructing the fallback-key portion of the credential plan. Add an end-to-end test for the selected product semantics.

#### ROUTE-SEC-008 — KV-based revocation and policy invalidation are eventually consistent

API-key and workspace-policy cache version tokens are stored in Workers KV, with isolate-local caching on top. This is fast and resilient, but KV is eventually consistent across locations. Standard API-key revocation and workspace-policy changes can therefore have a bounded propagation window at remote edges. OAuth-managed keys explicitly refresh against the source of truth and do not have the same cache behavior.

**Remediation:** Document the revocation SLA. For emergency revocation or high-risk controls, use a strongly consistent authority or a short-lived signed policy epoch that can be checked without relying solely on globally eventual KV.

#### ROUTE-SEC-009 — Security regression suite is not currently fully green

The focused audit run produced 97 passing tests and 8 failures. All eight failures were in `src/pipeline/before/index.pricing.test.ts` and were caused by the new `getBindings()` access in `beforeRequest` not being configured/mocked by that suite (`Gateway runtime not configured`). This is a test harness regression rather than evidence of a runtime bypass, but it removes coverage from pricing loss prevention, workspace policy rejection, and guardrail propagation.

There is also no explicit test named for `provider.ignore`, conflicting `only`/`ignore`, privacy settings lookup failure, unknown data-policy metadata, or a fallback attempt proving that every attempted provider remains in the effective allowed set.

**Remediation:** Repair the test runtime setup and add adversarial table-driven tests for the above cases before release.

### Low severity / hardening

#### ROUTE-SEC-010 — Production Worker compatibility/tooling configuration is stale

The production Worker uses `compatibility_date = "2025-10-01"` and Wrangler 4.94.0 reported that 4.113.0 is available. The current Cloudflare review guidance recommends periodically updating the compatibility date and generating binding types from configuration. Production still uses TOML, while the new performance Workers use JSONC.

This did not prevent the production dry-run build from succeeding.

#### ROUTE-SEC-011 — Decrypted BYOK byte buffers are not explicitly zeroed in the new preload path

The older on-demand BYOK loader clears its decrypted byte array, but `hydrateByokKeys` converts the returned bytes directly to a string without first retaining and clearing the byte buffer. JavaScript strings cannot be reliably zeroed, so this is defense in depth rather than complete memory erasure.

**Remediation:** Retain the decrypted byte array, convert it inside a `try`, and call `.fill(0)` in `finally`. Continue ensuring keys are never serialized into KV, diagnostics, audit rows, or errors.

## Positive security properties confirmed

### Authentication and isolation

- Inference keys use a structured identifier plus HMAC-SHA256 secret verification with a server-side pepper.
- Management keys are rejected on inference routes.
- Key status and expiration are checked.
- OAuth-managed keys re-check the source of truth and current consent scope.
- Workspace ID comes from the authenticated key or OAuth authorization, not request input.
- Internal mode requires a configured token of at least 128 characters and a constant-work comparison.

### Policy and provider controls

- Workspace provider allowlists/blocklists and key guardrails are applied before ranking.
- `provider.only` and `provider.ignore` are normalized through canonical provider aliases.
- An empty effective provider set is rejected rather than widened in `beforeRequest`.
- ZDR workspace defaults are applied after presets and overwrite weaker caller values.
- Residency/ZDR, provider status, model status, capability status, offer scope, and price caps are hard filters, not score hints.
- Ranking cannot reintroduce a provider removed by workspace policy because it receives the filtered provider array.

### BYOK

- Encrypted keys are selected by authenticated workspace, provider, enabled state, and known key IDs.
- Plaintext BYOK values are hydrated after the context cache boundary, not written to KV.
- Priority keys are attempted before managed credentials; fallback keys are attempted afterward.
- A BYOK credential belonging to a provider excluded by policy is never included because the provider candidate itself is absent.

### Routing and fallback

- Default balanced routing is cheap-first through inverse-square price weighting.
- Reliability exploration uses a seeded Thompson-style sample, so uncertain providers remain discoverable without dominating traffic.
- EWMA health records success, error, latency, throughput, and multiple time horizons.
- Open breakers are heavily deranked and admission blocks them except for deterministic half-open probes.
- No isolate-local in-flight load signal affects provider order; upstream 429 responses drive request-local fallback.
- Fallback walks the ranked candidate list rather than switching API endpoints or modalities.
- `allow_fallbacks: false` limits routing to the first ranked provider, although that provider’s credential plan can still include its priority/managed/fallback credentials.

### Performance Worker

- The performance Worker authenticates normal gateway API keys, then restricts the resolved workspace to one allowlisted production workspace.
- Performance mode requires the internal token and restricts endpoint names.
- KV and R2 are isolated from production.
- Testing-mode requests skip wallet charging and production audit-row persistence.
- Synthetic upstream credentials are stored as Worker secrets, not tracked configuration.

## How the current routing flow works

1. **Authenticate:** Verify API key/OAuth token, derive workspace and key identity, and check status, expiry, scope, key limits, and credit gates.
2. **Load context:** Read versioned L1/KV context where possible; otherwise fetch model/provider/pricing data from Supabase. Hydrate BYOK keys after the cache boundary.
3. **Apply workspace configuration:** Merge presets, workspace privacy defaults, provider/model guardrails, prompt-injection rules, sensitive-information rules, and capability/parameter constraints.
4. **Build the immutable candidate boundary:** Intersect the model’s providers with workspace allow/block policy, `provider.only`, `provider.ignore`, and data-policy restrictions. If empty, return a validation/policy error.
5. **Apply final hard gates:** Filter rollout status, routing status, capability status, regional/specialized offer scope, execution/data residency, ZDR, and price ceilings.
6. **Read optimistic health:** Use isolate-local health immediately and refresh KV in the background. No Durable Object is kept alive.
7. **Score candidates:** Default balanced routing combines inverse-square price weighting, a Thompson-style reliability draw, base/rollout weights, token affinity, optional cache affinity, and small preference multipliers. Open-breaker providers receive a near-zero multiplier.
8. **Create ordered fallback:** Rank all viable providers. Expand the provider list into priority BYOK credentials, managed gateway credentials, and fallback BYOK credentials.
9. **Dispatch:** Resolve the provider-specific executor, normalize the common IR into that provider’s request, mark the exact upstream fetch boundary, and send the request.
10. **Handle result:** A successful upstream response is returned/streamed. A non-2xx or transport failure is recorded and advances to the next credential/provider. Once streaming bytes have begun, transparent fallback is no longer possible.
11. **Update health and audit:** Record timings and health asynchronously, bill once, persist audit/usage data, and emit a redacted Axiom wide event.

## Changes represented by the current working tree

- Replaced the monolithic OpenAI-compatible executor route with provider-owned executors backed by shared generic helpers.
- Added unified upstream timing instrumentation across executor families.
- Added exact `time_to_upstream_request_ms`, request-build, upstream-header, request-count, poll/auth/preflight/media, latency, generation, and throughput measurements.
- Changed default balanced routing to inverse-square cheap-first selection with Thompson-style reliability exploration.
- Removed internal load from scoring and retained upstream 429-driven fallback.
- Made fallback consume the complete ranked provider list rather than a fixed five-provider limit.
- Added ordered multiple BYOK credentials with priority and fallback sections.
- Made health and sticky-cache reads optimistic through isolate-local state plus background KV refresh, avoiding an always-running Durable Object.
- Added the isolated synthetic upstream and performance gateway deployment for end-to-end Cloudflare benchmarking.
- Added performance-mode protections that prevent production billing/audit mutation while retaining authentication and routing behavior.

## Design deviation to resolve

The earlier product direction said request-level `routing.mode` should not exist, but the current implementation still accepts request `routing.mode`, `routing.sort`, and legacy `provider.sort`, and these can override the workspace/default routing mode. This is not an authentication vulnerability, but it is a contract mismatch and lets callers choose latency/throughput/price behavior instead of always using the intended default algorithm.

Decide whether these are supported expert overrides or should be removed from the public request contract. Whichever choice is made should be documented and tested.

## Validation performed

- `pnpm --filter @phaseo/gateway-api typecheck` — passed.
- Production `wrangler deploy --dry-run --config wrangler.toml` — passed; gzip bundle approximately 895.9 KiB.
- Focused security/routing suite — 97 passed, 8 failed because `index.pricing.test.ts` does not configure the newly required runtime binding access.
- Earlier focused routing/policy run — 42/42 passed for routing, workspace policy, and preset configuration.
- Existing live performance smoke checks confirmed:
  - Requests without the internal performance token are rejected.
  - Non-allowlisted performance endpoints are rejected.
  - Performance requests do not change wallet balances or create production `gateway_requests` rows.
  - Multi-provider 503/429 fallback reaches the next viable provider.

## Recommended remediation order

1. Stop unconditional payload persistence and align all detail/replay storage with workspace consent and retention.
2. Sanitize upstream URLs at the creation boundary and add secret-canary tests for Google managed and BYOK credentials.
3. Split security policy from optional enrichment and fail closed/last-known-good when it cannot be loaded.
4. Fail closed for unknown data-policy metadata under restrictive workspace settings.
5. Add bounded request/error readers and a total upstream-attempt safety ceiling.
6. Classify fallback-worthy versus terminal upstream errors.
7. Resolve or remove the unused BYOK fallback toggle and public routing-mode contract.
8. Repair the failing pre-routing suite and add adversarial policy-containment tests.
9. Define and document cache/revocation propagation SLAs.

## Overall verdict

The **provider selection boundary itself is well designed**: authenticated workspace policy, request filters, ZDR, and hard provider gates precede scoring, and fallback cannot escape the candidate set it receives.

The **full routing lifecycle is not yet rock solid** because sensitive-data persistence, URL secret redaction, and fail-open privacy enrichment can undermine that otherwise strong boundary. Addressing ROUTE-SEC-001 through ROUTE-SEC-004 should be treated as a release blocker for describing the gateway as security-hardened.
