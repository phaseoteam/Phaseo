# API IR Re-Architecture Plan (E2E)

Updated: 2026-02-17  
Owner: Gateway/API

## Goal
Migrate the API layer to a strict IR-first architecture across all routes, with provider adapters as thin translators, consistent streaming/accounting, and clear capability-driven routing.

## Operating Rules
- OpenAI-compatible surface as baseline; gateway-specific extensions remain supported.
- Route flow must be: `Surface -> IR -> Provider Request -> Provider Response -> IR -> Surface Response`.
- Unsupported provider parameters are silently dropped at provider translation time (not hard-failed), unless they break gateway surface validation.
- Capability routing must be explicit per provider + modality (no implicit all-capability assumptions).
- Legacy direct-path logic is removed once equivalent IR path is validated.

## Scope
- In scope:
  - Text generation surfaces: `/v1/responses`, `/v1/chat/completions`, `/v1/messages`
  - Shared IR contracts and translators
  - Provider parameter policy + capability registry
  - Streaming normalization, usage/cost accounting, observability
  - Test harness and provider compatibility matrix
- Out of scope (later phases after text parity):
  - Full image/audio/video/music/ocr parity refactors
  - New product features unrelated to translation/routing architecture

## Progress Legend
- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete
- `[!]` Blocked

## Master Tracker
| ID | Workstream | Status | PR | Notes |
|---|---|---|---|---|
| WS-00 | Baseline + inventory | `[~]` | | Initial route/pipeline map captured below |
| WS-01 | IR contract hardening | `[~]` | | Text IR contract validator added and wired into text pipeline |
| WS-02 | Surface translators (responses/chat/messages) | `[~]` | | Shared chat/responses normalizers extracted for `response_format` + `image_config` |
| WS-03 | Capability + param policy registry | `[~]` | | Code-first text param policy module added and wired into capability checks |
| WS-04 | Provider executor translation unification | `[~]` | | Execute-stage text normalization quirks extracted into code-first policy module |
| WS-05 | Streaming/event normalization | `[x]` | | Canonical stream events + protocol encoders + regressions landed |
| WS-06 | Usage/cost metering consistency | `[x]` | | Canonical usage fallback + request meter shaping + idempotent charge guard landed |
| WS-07 | Error model + observability cleanup | `[x]` | | Unified error envelopes, single-owner wide-event emission, and debug diagnostics landed |
| WS-08 | E2E provider test framework + reports | `[ ]` | | |
| WS-09 | Legacy path removal | `[~]` | | Adapter-first batch/files execution path removed; endpoints now explicit not_implemented |
| WS-10 | Rollout + guardrails | `[ ]` | | |

## Phase Plan

### WS-00 Baseline + Inventory
**Outcome:** clear map of current execution paths, duplicate logic, and legacy bypasses.

- [x] Catalog all route entrypoints and current pipelines in `apps/api/src/routes/v1/*`
- [x] Map each text route to current translator/executor paths
- [x] List all legacy/non-IR code paths still reachable in production
- [ ] Capture baseline behavior snapshots for responses/chat/messages (stream + non-stream)
- [x] Document blocker list and sequencing dependencies

**Definition of done**
- One inventory doc section committed here
- Every text route has one identified canonical code path target

#### Initial Inventory Snapshot (2026-02-17)
**Text route entrypoints**
- `/v1/chat/completions` -> `apps/api/src/routes/v1/data/chat-completions.ts`
- `/v1/responses` -> `apps/api/src/routes/v1/data/responses.ts`
- `/v1/messages` -> `apps/api/src/routes/v1/data/messages.ts`

**Current text execution chain**
- All three text routes call `makeEndpointHandler(...)` in `apps/api/src/pipeline/index.ts`.
- `makeEndpointHandler` resolves runner via `resolvePipeline(endpoint)` in `apps/api/src/pipeline/registry.ts`.
- Registry currently maps `chat.completions`, `responses`, and `messages` to `runTextGeneratePipeline`.
- `runTextGeneratePipeline` in `apps/api/src/pipeline/surfaces/text-generate.ts` does:
  - protocol detection (`detectProtocol`)
  - decode to IR (`decodeProtocol`)
  - execute (`doRequestWithIR`)
  - encode back to protocol (`encodeProtocol`)
  - finalize + audit (`finalizeRequest`)

**Immediate architectural risks found**
- `resolvePipeline(...)` currently falls back to `runTextGeneratePipeline` for unmapped endpoints; this should become explicit-fail to prevent accidental routing.
- Error wrapping in `pipeline/index.ts` and `surfaces/text-generate.ts` still emits generic `"IR pipeline error"` wrappers; error-envelope standardization remains pending under WS-07.
- Capability/param policy currently spans `before/capabilityValidation.ts`, `before/paramCapabilities.ts`, and parts of execute stage; this confirms WS-03/WS-04 split is needed.

**Sequencing dependencies / blockers**
- WS-01 (IR contract hardening) must land before WS-02 translator cleanup to avoid translator churn.
- WS-03 (capability + param policy registry) should land before WS-04 executor unification so executor logic can consume a single policy source.
- WS-05/WS-06 (stream + metering) depend on WS-02 reverse translators to avoid duplicated usage accounting paths.
- Existing uncommitted workspace changes on `main` are unrelated; API migration work should stay file-scoped to avoid accidental coupling with web/devtools edits.

**Reachable legacy/non-canonical paths (initial)**
- `apps/api/src/pipeline/registry.ts`: `resolvePipeline(...)` defaults to `runTextGeneratePipeline` for unmapped endpoints (`PIPELINES[endpoint] ?? runTextGeneratePipeline`), which can mask misconfigured endpoint mappings.
- `apps/api/src/pipeline/index.ts`: top-level catch wraps execution failures into a generic `\"IR pipeline error\"` response rather than canonical route-specific error envelopes.
- `apps/api/src/pipeline/surfaces/text-generate.ts`: surface-level catch also emits generic `\"IR pipeline error\"`, duplicating error shaping logic outside a single error mapper.
- `apps/api/src/pipeline/execute/index.ts`: text.generate execution still performs provider-aware `normalizeIRForProvider(...)` inside execute stage, so translation policy is partially coupled to execution instead of fully isolated as translator/policy modules.

### WS-01 IR Contract Hardening
**Outcome:** one canonical text IR contract with explicit semantics.

- [ ] Freeze `TextGenerateIR` schema fields and defaults
- [ ] Formalize tool-call representation and delta semantics
- [ ] Formalize structured output shape for `text`, `json_object`, `json_schema`
- [ ] Remove/forbid unsupported surface fields from IR (example: `n`)
- [x] Add strict validators + unit tests for IR invariants

**Progress notes (2026-02-18)**
- Added `apps/api/src/pipeline/text-ir-contract.ts` for endpoint-agnostic IR contract checks.
- Text pipeline now validates decoded IR before execution and returns canonical `400 invalid_request` on contract violations.
- Added coverage in `apps/api/src/pipeline/text-ir-contract.test.ts`.

**Definition of done**
- IR schema is stable and versioned
- Translator and executor tests consume the same contract fixtures

### WS-02 Surface Translators (Responses/Chat/Messages)
**Outcome:** deterministic and symmetric surface <-> IR translation.

- [ ] Build/clean translators for `/responses` -> IR
- [ ] Build/clean translators for `/chat/completions` -> IR
- [ ] Build/clean translators for `/messages` -> IR
- [ ] Implement reverse translators from IR result/events to each surface format
- [ ] Add golden tests for each surface (streaming + non-streaming)

**Progress notes (2026-02-18)**
- Added shared normalizer module `apps/api/src/protocols/shared/text-normalizers.ts`.
- Chat and Responses decoders now share one mapping path for `response_format` and `image_config`.
- Chat, Responses, and Messages decoders now share one mapping path for `service_tier`/`speed` resolution.
- Chat and Responses decoders now share one mapping path for `tool_choice` normalisation.
- Added unit coverage in `apps/api/src/protocols/shared/text-normalizers.test.ts`.

**Definition of done**
- Surface behavior is reproducible from IR fixtures only
- No provider-specific conditionals inside surface translators

### WS-03 Capability + Param Policy Registry
**Outcome:** routing decisions and parameter treatment are explicit and inspectable.

- [ ] Define provider capability registry by modality + endpoint support
- [ ] Define provider param support matrix (allow/drop/transform)
- [ ] Add policy for silent-drop with optional debug trace metadata
- [ ] Integrate registry checks before execution
- [ ] Add diagnostics endpoint/report for effective capability + param decisions

**Progress notes (2026-02-18)**
- Added `apps/api/src/pipeline/before/textParamPolicy.ts` as a code-first registry for:
  - text endpoint allowed params + canonical mappings
  - canonical alias expansion
  - central `isAlwaysSupportedParam(...)` rules
  - provider param support overrides (initial: Cerebras unsupported penalties/bias fields)
- `providerSupportsParam(...)` now consumes code overrides before metadata fallback.
- `validateCapabilities(...)` now consumes centralized always-supported policy.
- Added shared `getUnsupportedParamsForProvider(...)` helper and wired after-stage guard attribution to use central policy rules.
- Removed unused legacy `guardProviderParams` path to keep one active capability-validation flow.
- Added coverage in `apps/api/src/pipeline/before/textParamPolicy.test.ts`.
- Added centralized provider profile registry in `apps/api/src/providers/providerProfiles.ts` and migrated both:
  - `apps/api/src/providers/capabilities.ts` (text-only and adapter capability flags)
  - `apps/api/src/providers/textProfiles.ts` (text param/normalize hints)
  This reduces provider onboarding edits to one profile source for policy metadata.
- Added provider preference filtering in `validateCapabilities(...)`:
  - prefer providers with best requested-param support
  - keep full fallback pool when no provider supports requested params
  - expose filtering via `param_preference` diagnostics stage

**Definition of done**
- Provider support can be queried without reading executor code
- Unsupported fields are consistently handled (drop or transform) per policy

### WS-04 Provider Executor Translation Unification
**Outcome:** executor layer is thin, provider-focused, and consistent.

- [ ] Standardize executor input/output contracts around IR
- [ ] Move provider quirks into isolated quirk/policy files
- [ ] Remove duplicated transformation logic between providers
- [ ] Ensure request meter insertion where required (example: xAI)
- [ ] Validate all text providers for shape compliance (no E2E yet)

**Progress notes (2026-02-18)**
- Added `apps/api/src/pipeline/execute/textNormalizePolicy.ts` for code-first normalization quirks:
  - protocol/provider temperature ceilings
  - fallback reasoning effort ladders
  - Anthropic default max tokens
- `apps/api/src/pipeline/execute/normalize.ts` now consumes this policy module (reduced inline provider-specific branching).
- Added coverage in `apps/api/src/pipeline/execute/textNormalizePolicy.test.ts`.

**Definition of done**
- Provider executors have a common skeleton
- Quirk logic is centralized and test-covered

### WS-05 Streaming/Event Normalization
**Outcome:** one normalized internal event stream feeding all surfaces.

- [x] Define canonical stream event model (text deltas, tool deltas, finish, usage)
- [x] Normalize SSE/chunked responses from providers to canonical events
- [x] Ensure tools + stream interaction policy is enforced consistently
- [x] Build reverse stream formatters for responses/chat/messages
- [x] Add regression tests for truncation, out-of-order chunks, finish reasons

**Progress notes (2026-02-18)**
- Added `apps/api/src/pipeline/after/stream-events.ts` to normalize protocol stream frames to canonical events:
  - `start`, `delta_text`, `delta_tool`, `usage`, `stop`, `error`, `snapshot`
- Wired `apps/api/src/pipeline/after/streaming.ts` to extract canonical events for every parsed frame and drive final-usage/final-snapshot detection from those events (with fallback heuristics).
- Wired `apps/api/src/pipeline/after/stream.ts` to consume canonical stream events for finish reason and tool-call counting during streaming.
- Added unit coverage in `apps/api/src/pipeline/after/stream-events.test.ts`.
- Added protocol-mismatch fallback in stream event extraction, so canonical events are still produced when upstream wire shape differs from requested surface.
- Added stream regression tests for truncated streams (aborted finalize), out-of-order trailing frames, and finish-reason normalization edges.
- Added `apps/api/src/protocols/stream/encode.ts` to encode canonical stream events back into OpenAI Chat, OpenAI Responses, and Anthropic Messages stream frame shapes.
- Added unit coverage in `apps/api/src/protocols/stream/encode.test.ts`.
- Wired `apps/api/src/pipeline/after/streaming.ts` to use protocol-aware re-encoding when upstream wire shape differs from requested protocol surface.

**Definition of done**
- Every text route streams from the same canonical event pipeline
- Usage/final events emitted once and consistently

### WS-06 Usage/Cost Metering Consistency
**Outcome:** accurate billing and analytics across stream/non-stream and all providers.

- [x] Unify token extraction fallback order per provider
- [x] Handle providers that return only `total_tokens`
- [x] Prevent double counting across retries/fallbacks
- [x] Standardize request meter insertion and request-count metering
- [x] Add invariant tests for non-zero usage where expected

**Progress notes (2026-02-18)**
- Added shared canonical usage resolver in `apps/api/src/core/usage-normalization.ts`:
  - token fallback order normalization across common provider usage shapes
  - explicit handling for `total_tokens`-only payloads
  - request-count fallback (`requests=1`) when token usage is present and provider did not report explicit request meter
- Wired usage resolver into:
  - `apps/api/src/executors/_shared/usage/text.ts` (pricing meter normalization)
  - `apps/api/src/pipeline/usage.ts` (client-facing usage shaping)
- Added unit tests:
  - `apps/api/src/core/usage-normalization.test.ts`
  - extended `apps/api/src/executors/_shared/usage/text.test.ts`
  - extended `apps/api/src/pipeline/usage.test.ts`
- Added idempotent charge helper `apps/api/src/pipeline/after/charge.ts` and wired non-stream + stream finalize paths through it to prevent duplicate request charging.
- Added coverage in `apps/api/src/pipeline/after/charge.test.ts`.

**Definition of done**
- Same request yields same accounting semantics regardless of surface
- Cost lines reconcile with final usage for stream and non-stream

### WS-07 Error Model + Observability Cleanup
**Outcome:** actionable logs and stable error envelopes.

- [x] Standardize gateway error envelope fields and mapping
- [x] Ensure upstream error reason is captured once with request correlation
- [x] Remove noisy duplicate events per request
- [x] Add redaction policy for sensitive values in logs
- [x] Add debug mode payload for param drops/transforms and routing rationale

**Progress notes (2026-02-18)**
- Added shared `buildPipelineExecutionErrorResponse(...)` + `logPipelineExecutionError(...)` helper.
- Wired helper into entrypoint and all pipeline surfaces (`text-generate`, `embeddings`, `moderations`, `non-text`, `video-generate`, `adapter`).
- Added unit coverage in `apps/api/src/pipeline/error-response.test.ts`.
- Extended gateway debug error payloads to include routing and param-policy diagnostics (`requested_params`, param filtering snapshot, provider candidate diagnostics) for failure-path explainability.

**Definition of done**
- One request correlates to one coherent trace in logs
- Debug output explains failure/param behavior without exposing secrets

### WS-08 E2E Provider Test Framework + Reports
**Outcome:** repeatable provider validation from CLI with artifacts.

- [ ] Keep/extend provider test runner flags (provider/model/surface/scenario)
- [ ] Ensure JSON artifact output per run in reports folder
- [ ] Add required scenarios: non-stream, stream, tools, structured outputs
- [ ] Add messages/chat/responses surface coverage
- [ ] Add CI-friendly summary for pass/fail per provider

**Definition of done**
- Single command can validate one provider or matrix and produce artifacts

### WS-09 Legacy Path Removal
**Outcome:** no legacy bypasses; all relevant text flows use IR path.

- [x] Remove dead route handlers and direct executor bypasses
- [ ] Delete deprecated schemas/translators superseded by IR path
- [ ] Remove temporary compatibility shims no longer needed
- [ ] Update docs for new architecture map

**Progress notes (2026-02-18)**
- Removed adapter-surface execution path for deferred endpoints:
  - deleted `apps/api/src/pipeline/surfaces/adapter.ts`
  - removed `doRequestWithAdapters(...)` from `apps/api/src/pipeline/execute/index.ts`
- `batch` and `files.*` now route to explicit not-implemented handling:
  - added `apps/api/src/pipeline/surfaces/not-implemented.ts`
  - updated `apps/api/src/pipeline/registry.ts`
  - updated `apps/api/src/pipeline/registry.test.ts`
- Removed legacy OpenAI batch provider endpoint adapter and disabled direct `/batches` and `/files` OpenAI proxy behavior in route handlers.

**Definition of done**
- Text routes have only one production path: IR-first

### WS-10 Rollout + Guardrails
**Outcome:** safe migration with reversible controls.

- [ ] Add rollout flags for translator/executor switching where needed
- [ ] Ship canary by provider cohort
- [ ] Monitor error/latency/cost drift dashboards
- [ ] Define rollback playbook per workstream
- [ ] Finalize production readiness checklist

**Definition of done**
- Migration completed with no unresolved blockers
- Flags removed or defaulted after stabilization

## PR Sequencing (Proposed)
1. PR-A: WS-00 inventory + doc scaffold + no-op plumbing
2. PR-B: WS-01 IR contract hardening + tests
3. PR-C: WS-02 surface translators + golden tests
4. PR-D: WS-03 capability/param registry + diagnostics
5. PR-E: WS-04 executor unification batch 1 (top providers)
6. PR-F: WS-05 streaming normalization
7. PR-G: WS-06 usage/cost unification
8. PR-H: WS-07 logging/error cleanup
9. PR-I: WS-08 provider test harness/report hardening
10. PR-J: WS-09 cleanup + WS-10 rollout controls

## Change Log
- 2026-02-17: Initial end-to-end plan and tracker created.
- 2026-02-18: WS-07 started; unified pipeline execution error envelope/logging and added tests.
- 2026-02-18: WS-02 started; extracted shared chat/responses normalizers and added tests.
- 2026-02-18: WS-02 translator cleanup continued; unified service tier normalisation across text surfaces.
- 2026-02-18: WS-02 translator cleanup continued; unified OpenAI-style tool_choice normalisation.
- 2026-02-18: WS-01 started; added text IR contract validation and 400-level contract error responses.
- 2026-02-18: WS-03 started; introduced code-first text parameter policy registry and wired capability checks.
- 2026-02-18: WS-04 started; extracted execute-stage text normalization quirks into a dedicated policy module.
- 2026-02-18: WS-03 cleanup continued; unified unsupported-param attribution and removed duplicate preflight param guard path.
- 2026-02-18: WS-05 continued; added stream event fallback for protocol/wire-shape mismatch and truncation/out-of-order regression tests.
- 2026-02-18: WS-05 completed; added shared protocol stream event encoders and tests.
- 2026-02-18: WS-06 completed; request count shaping and idempotent charge guard landed with tests.
- 2026-02-18: WS-07 completed; consolidated success/failure wide-event behavior and expanded redacted failure diagnostics.
- 2026-02-18: WS-09 started; removed adapter-first batch/files execution and replaced route behavior with explicit not_implemented responses.
