# API Pipeline Performance Review Tracker

Last updated: 2026-03-09
Status: Remediation in progress

## Goal
Capture bottlenecks, performance risks, and other notable issues for each API stage before making changes.

## Stage Status

| Stage | Review Status | Notes |
|---|---|---|
| `before` | Complete (initial pass) | Primary hot-path bottlenecks identified |
| `execute` | Complete (initial pass) | Hot-path KV/health and routing overhead identified |
| `after` | Complete (initial pass) | Stream finalization and post-processing side effects are primary hotspots |

## Remediation Progress (2026-03-09)

### Completed from the initial hotspot batch

1. Execute failover now continues on non-2xx upstream attempts.
   - Area: `apps/api/src/pipeline/execute/index.ts`
2. Non-stream after-stage sticky/audit/charge side effects moved off response-critical path.
   - Area: `apps/api/src/pipeline/after/index.ts`
3. Stream final usage callback no longer blocks stream completion.
   - Area: `apps/api/src/pipeline/after/streaming.ts`
4. Execute health hot path no longer blocks on KV writes; health state now uses short-lived L1 cache + background KV persistence.
   - Area: `apps/api/src/pipeline/execute/health.ts`
5. High-volume routing/provider-enable logs are now gated/reduced on hot paths.
   - Areas: `apps/api/src/pipeline/execute/routing.ts`, `apps/api/src/pipeline/before/index.ts`, `apps/api/src/pipeline/after/audit.ts`
6. Durable request-level charge idempotency wrapper added.
   - Areas: `apps/api/src/pipeline/pricing/persist.ts`, `supabase/migrations/20260309173000_gateway_request_charge_idempotency.sql`
7. Pricing-card fallback now uses shared base-model normalization.
   - Area: `apps/api/src/pipeline/after/pricing.ts`
8. Reduced cache-miss preflight fan-out by removing redundant model/capability status re-queries.
   - Area: `apps/api/src/pipeline/before/context.ts`
9. Health-state concurrency hardening pass completed.
   - Areas: `apps/api/src/pipeline/execute/health.ts`, `apps/api/src/pipeline/execute/health.test.ts`
   - Includes key-scoped in-isolate update serialization and merge-on-write reconciliation for background KV persistence.
10. Charge-idempotency migration rolled out and canary-validated.
   - Areas: `supabase/migrations/20260309173000_gateway_request_charge_idempotency.sql`
   - Validation: `supabase db push --linked`, `supabase migration list --linked`, non-mutating RPC probe (`missing_team_id`) confirms function availability.
11. Auth hot path now uses short-lived in-isolate key-row L1 cache to avoid repeated KV/DB lookups on immediate repeat requests.
   - Areas: `apps/api/src/pipeline/before/auth.ts`, `apps/api/src/pipeline/before/auth.cache.test.ts`
   - Validation: `pnpm --filter @ai-stats/gateway-api test src/pipeline/before/auth.cache.test.ts tests/performance/before-latency.test.ts`
12. Before-stage context miss path now dedupes concurrent in-flight loads per cache key to prevent thundering-herd duplicate RPC/query work.
   - Areas: `apps/api/src/pipeline/before/context.ts`, `apps/api/src/pipeline/before/context.inflight.test.ts`
   - Validation: `pnpm --filter @ai-stats/gateway-api test src/pipeline/before/context.inflight.test.ts`
13. Before-stage provider candidate filtering now enforces pricing coverage preflight (drops unpriced providers and fails fast when none are priceable).
   - Area: `apps/api/src/pipeline/before/index.ts`
   - Outcome: prevents unpriced execution paths from reaching provider attempts.
14. Before-stage context cache split into dynamic (`key/limits/credit/settings`) and static (`providers/pricing/model`) segments with parallel KV reads.
   - Area: `apps/api/src/pipeline/before/context.ts`
   - Outcome: better cache reuse and lower miss amplification across mixed-model traffic.
15. Dashboard key deletion/limit updates now trigger immediate gateway key cache invalidation in safer order.
   - Area: `apps/web/src/app/(dashboard)/settings/keys/actions.ts`
   - Outcome: key mutations propagate quickly to runtime preflight cache behavior.

### Follow-up watch items

1. Monitor cross-isolate same-provider health churn under sustained load.
   - Current hardening removes same-isolate races and reduces cross-isolate clobbering, but exact additive guarantees are still bounded by KV consistency semantics.

## Stage: `before`

### High Severity

1. Hot-path SQL performs heavy analytics and mutation per request.
   - Evidence:
     - `supabase/migrations/20260227170000_add_internal_testing_capability_status.sql` lines 217-231, 289-353
     - `supabase/migrations/20260226000004_calendar_month_tier_lock_window.sql` lines 48-61, 153-180
   - Why this is a bottleneck:
     - The request context RPC aggregates `gateway_requests` multiple times and calls `calculate_tier_with_grace`, which locks and updates `teams` on the request path.

2. Cache miss path fans out into many DB queries after the context RPC.
   - Evidence:
     - `apps/api/src/pipeline/before/context.ts` lines 675-680, 753-756, 784-797, 833-838, 857-868
   - Why this is a bottleneck:
     - On miss, request preflight does RPC + enrichment query fan-out (provider/model/capability/team settings), increasing tail latency and DB load.

3. Model fallback can trigger a second RPC + additional lookups.
   - Evidence:
     - `apps/api/src/pipeline/before/context.ts` lines 695-708, 406-412, 429-434
   - Why this is a bottleneck:
     - Unresolved provider-scoped model requests can execute model-resolution DB queries and then a second full context RPC.

### Medium Severity

4. Cache strategy is conservative, and debug mode bypasses cache.
   - Evidence:
     - `apps/api/src/pipeline/before/context.ts` lines 660-667, 939-959
     - `apps/api/src/pipeline/before/index.ts` lines 49-55, 89-100
   - Why this is a bottleneck:
     - Lower effective TTL under normal operation + explicit bypass in debug/testing scenarios increases hot-path recomputation.

5. Additional KV round-trips occur before DB/RPC work.
   - Evidence:
     - `apps/api/src/core/kv.ts` lines 64-66
     - `apps/api/src/pipeline/before/auth.ts` lines 167-169
     - `apps/api/src/pipeline/before/context.ts` line 650
   - Why this is a bottleneck:
     - Key version token reads are part of auth/context cache key flow and add network RTT.

### Low to Medium Severity

6. Duplicate adapter/provider checks in preflight.
   - Evidence:
     - `apps/api/src/pipeline/before/utils.ts` lines 44-51
     - `apps/api/src/pipeline/before/index.ts` lines 176-205
   - Why this is a bottleneck:
     - Similar provider filtering logic runs twice in the same request path.

7. Parameter support checks scale by params x providers.
   - Evidence:
     - `apps/api/src/pipeline/before/capabilityValidation.ts` lines 198-207, 115-123
   - Why this is a bottleneck:
     - CPU cost grows with provider pool size and parameter count (usually manageable, but additive under load).

## Stage: `execute`

### High Severity

1. Per-attempt health accounting performs synchronous KV read-modify-write on the request path.
   - Evidence:
     - `apps/api/src/pipeline/execute/index.ts` lines 372, 476-484, 558-564
     - `apps/api/src/pipeline/execute/health.ts` lines 177-191, 494-504, 522-587
   - Why this is a bottleneck:
     - Each provider attempt does `onCallStart` and `onCallEnd`, each of which loads/parses/writes the shared health map in KV before the request completes.

2. Health map updates are non-atomic read-modify-write, creating lost-update risk under concurrency.
   - Evidence:
     - `apps/api/src/pipeline/execute/health.ts` lines 177-191, 253-260, 522-587
   - Why this is an issue:
     - Concurrent requests can overwrite each other when writing the same map key, degrading breaker/load signal quality and routing decisions.

3. Failover loop does not fail over on non-2xx upstream responses.
   - Evidence:
     - `apps/api/src/pipeline/execute/index.ts` lines 266-274
     - `apps/api/src/pipeline/execute/index.ts` lines 475-491, 511-549
   - Why this is an issue:
     - `attemptProviderWithIR` returns `{ ok: true }` even when `upstream.ok` is false, so execute exits early and does not try lower-ranked providers.

### Medium Severity

4. Sticky-routing adds per-request hashing and KV reads in routing path.
   - Evidence:
     - `apps/api/src/pipeline/execute/routing.ts` lines 428-441
     - `apps/api/src/pipeline/execute/sticky-routing.ts` lines 35-45, 47-52, 328-336, 348-356
   - Why this is a bottleneck:
     - Text requests perform context serialization + SHA-256 + KV lookup before provider selection.

5. Missing pricing cards trigger DB pricing lookups during attempts.
   - Evidence:
     - `apps/api/src/pipeline/execute/index.ts` lines 347-354
     - `apps/api/src/pipeline/pricing/loader.ts` lines 8-25
   - Why this is a bottleneck:
     - In paths where pricing is not preloaded (notably testing-mode candidates), execute can issue extra DB queries per attempt.

6. Routing performs non-trivial per-request scoring work and weighted ordering.
   - Evidence:
     - `apps/api/src/pipeline/execute/routing.ts` lines 165-179, 242-280, 627-697, 727
   - Why this is a bottleneck:
     - Weighted selection uses repeated reductions and scoring over the full pool, adding CPU cost as candidate count grows.

7. Failed upstream attempts parse/clones response payloads on hot path.
   - Evidence:
     - `apps/api/src/pipeline/execute/index.ts` lines 143-173, 491-508
   - Why this is a bottleneck:
     - On non-2xx responses, body clone/read/JSON parse and preview generation add extra latency and memory overhead.

### Low to Medium Severity

8. Execute routing emits high-cardinality logs on every request.
   - Evidence:
     - `apps/api/src/pipeline/execute/routing.ts` lines 613-625
   - Why this is a bottleneck:
     - Per-request pool diagnostics can increase CPU/log ingestion overhead under volume.

9. Legacy execute path file appears unused (`attempt.ts`).
   - Evidence:
     - `apps/api/src/pipeline/execute/attempt.ts` exports `attemptProvider`
     - Repository search usage indicates no call sites
   - Why this is an issue:
     - Dead/duplicate execution logic increases maintenance risk and can cause drift from the active path.

## Stage: `after`

### High Severity

1. Stream finalization blocks completion while running heavy post-processing.
   - Evidence:
     - `apps/api/src/pipeline/after/streaming.ts` lines 103-110, 261-266, 268-274
     - `apps/api/src/pipeline/after/stream.ts` lines 311-334, 360, 368-387, 451-483
   - Why this is a bottleneck:
     - Final usage handling is awaited before the final outbound frame write path continues, and that callback performs health updates, sticky-routing writes, audit persistence, and charging.

2. Non-stream responses serialize multiple network-bound side effects before returning.
   - Evidence:
     - `apps/api/src/pipeline/after/index.ts` lines 158-170, 252-271, 282-304, 348-349
     - `apps/api/src/pipeline/audit/index.ts` lines 21-35, 167-173
     - `apps/api/src/pipeline/pricing/persist.ts` lines 43-63, 66-107
   - Why this is a bottleneck:
     - Pricing load, sticky-routing write, audit insert (with retry/backoff), and usage charge/top-up all run on the request completion path before the response is returned.

3. Charging path can trigger additional synchronous billing calls (including Stripe) in after-stage.
   - Evidence:
     - `apps/api/src/pipeline/after/charge.ts` lines 20-25
     - `apps/api/src/pipeline/pricing/persist.ts` lines 59-63, 73-87, 95-103
   - Why this is a bottleneck:
     - Charge recording is awaited and may branch into payment-method lookup and payment-intent creation, which can materially increase tail latency under top-up scenarios.

### Medium Severity

4. Stream frame rewriting does repeated usage shaping/pricing work per usage-bearing frame.
   - Evidence:
     - `apps/api/src/pipeline/after/stream.ts` lines 118-140, 159-181
     - `apps/api/src/pipeline/after/streaming.ts` lines 153-156, 249-257
   - Why this is a bottleneck:
     - High-frame streams repeatedly parse/re-encode JSON and recompute usage pricing, increasing CPU cost as frame count grows.

5. Upstream non-2xx guard path incurs dynamic import + parse + audit write.
   - Evidence:
     - `apps/api/src/pipeline/after/guards.ts` lines 29-33, 70-78
     - `apps/api/src/pipeline/audit/index.ts` lines 238-243, 312-321
   - Why this is a bottleneck:
     - Error bursts execute additional module load/parsing and DB write attempts, amplifying pressure in degraded scenarios.

6. Success audit path includes broad payload enrichment and unconditional logging.
   - Evidence:
     - `apps/api/src/pipeline/after/audit.ts` lines 362-395, 406-407, 447-462
   - Why this is a bottleneck:
     - Building large audit/event payloads plus unconditional success logging adds CPU/log ingestion overhead on every successful request.

### Low to Medium Severity

7. Pricing fallback derives base model using string split, which can miss normalized model mapping.
   - Evidence:
     - `apps/api/src/pipeline/after/pricing.ts` line 41
     - `apps/api/src/pipeline/after/index.ts` line 257
   - Why this is an issue:
     - Inconsistent base-model derivation compared to other paths can cause avoidable pricing-card lookup misses and extra DB fallback work.

8. Charge idempotency guard is request-local metadata only.
   - Evidence:
     - `apps/api/src/pipeline/after/charge.ts` lines 16-18
   - Why this is an issue:
     - Prevents duplicate charging within one pipeline execution, but does not protect across retries/replays outside the same in-memory request context.

9. Non-stream payload enrichment deep-clones normalized payloads.
   - Evidence:
     - `apps/api/src/pipeline/after/payload.ts` lines 53-55
   - Why this is a bottleneck:
     - `structuredClone` on full normalized payload adds memory/CPU cost proportional to response size.

## Change Policy For This Document

- Add findings stage by stage.
- Keep severity ordering (`High`, `Medium`, `Low`).
- Record evidence paths/lines for every finding.
- Do not apply fixes until cross-stage review is complete.

## Cross-Stage Action Plan

### Objective
Resolve correctness risks first, then reduce p95/p99 latency, then improve throughput/cost efficiency.

### Execution Principles

- Ship in small slices behind flags where possible.
- Separate correctness fixes from performance refactors.
- Measure before/after every phase with the same load profile.
- Keep contract behavior stable unless explicitly called out.

### Phase 0: Baseline and Guardrails (1-2 days)

1. Lock baseline metrics and load profile.
   - Capture: p50/p95/p99 latency, error rate, non-2xx distribution, retries/failover rate, KV ops/request, DB ops/request, audit/charge durations.
2. Add lightweight span counters around known hotspots if missing.
   - Focus: `before_context`, `execute_health`, `after_audit_success`, `after_record_usage_charge`, stream finalization callback duration.
3. Define acceptance gates for each phase.
   - Gate examples: no regression in success rate; no schema/contract breaks; latency target met for target traffic mix.

### Phase 1: Correctness and Safety Fixes (P0, do first)

1. Fix execute failover behavior on non-2xx upstream responses.
   - Area: `apps/api/src/pipeline/execute/index.ts`
   - Outcome: non-2xx from one provider can proceed to next provider when policy allows.
2. Make health-state updates concurrency-safe.
   - Area: `apps/api/src/pipeline/execute/health.ts`
   - Outcome: remove lost-update risk from non-atomic KV read-modify-write.
3. Add durable charge idempotency.
   - Area: `apps/api/src/pipeline/after/charge.ts`, `apps/api/src/pipeline/pricing/persist.ts`, DB side idempotency key by `request_id`.
   - Outcome: prevent duplicate debits across retries/replays, not just in-process re-entry.
4. Standardize base-model derivation for pricing lookup.
   - Area: `apps/api/src/pipeline/after/pricing.ts`
   - Outcome: use shared normalization (`getBaseModel`) to avoid pricing-card miss drift.

### Phase 2: Tail Latency Reduction on Request Path (P1)

1. Move non-critical after-stage side effects off the response-critical path.
   - Candidates: success audit insert, event emission, sticky-routing write, charge/top-up trigger.
   - Mechanism: background dispatch with bounded retries and clear failure telemetry.
2. Reduce stream finalization blocking.
   - Area: `apps/api/src/pipeline/after/streaming.ts`, `apps/api/src/pipeline/after/stream.ts`
   - Outcome: finalize client-visible stream promptly; run heavy post-processing asynchronously where safe.
3. Parallelize independent non-stream steps where ordering is not required.
   - Area: `apps/api/src/pipeline/after/index.ts`
   - Outcome: avoid serial waits for unrelated network calls.
4. Reduce before-stage miss fan-out.
   - Area: `apps/api/src/pipeline/before/context.ts` and relevant SQL/RPC.
   - Outcome: fewer round-trips on cache miss path.

### Phase 3: Throughput and CPU Optimizations (P2)

1. Minimize per-frame stream compute.
   - Apply pricing/usage shaping only on final usage snapshot when possible.
   - Keep intermediate frame rewriting minimal.
2. Reduce payload cloning overhead.
   - Area: `apps/api/src/pipeline/after/payload.ts`
   - Outcome: replace full `structuredClone` with selective shaping/copy.
3. Lower high-cardinality and unconditional logging on hot paths.
   - Areas: execute routing logs, after success audit logs, stream pricing logs.
   - Outcome: lower CPU + log ingestion pressure at scale.

### Phase 4: Data-Plane Deep Optimizations (P3)

1. Refactor context SQL/RPC hot path.
   - Reduce repeated aggregates and write-on-read behavior in request context path.
   - Consider pre-aggregation/materialization for tier/billing window calculations.
2. Rework health signal storage model.
   - Move from shared map overwrite pattern to safer per-provider counters or append/event model.
3. Revisit sticky-routing storage/query strategy for high scale.
   - Reduce per-request hashing + KV cost for common traffic patterns.

### Work Breakdown by Finding

| Finding Group | Priority | Primary Fix |
|---|---|---|
| Execute non-2xx no failover | P0 | Correct retry/failover decision boundary in execute loop |
| Health KV lost updates + sync overhead | P0/P1 | Concurrency-safe health writes, then reduce synchronous path impact |
| Charge idempotency scope too narrow | P0 | Durable idempotency keyed by request ID |
| After-stage serial side effects | P1 | Async/background side effects + required-order minimization |
| Stream final usage callback is heavy | P1 | Fast completion path + deferred heavy writes |
| Before-stage cache miss query fan-out | P1 | Consolidate context fetch/enrichment and cache strategy |
| Per-frame pricing/usage rewrite cost | P2 | Final-frame pricing strategy and lighter frame mutation |
| Audit/log payload and log volume overhead | P2 | Slim payload generation and log-level gating |
| Model normalization drift in pricing | P0 | Shared normalization utility use everywhere |
| Payload deep clone overhead | P2 | Selective copy/shaping instead of full clone |

### Validation Plan Per Phase

1. Functional checks.
   - Contract tests for each endpoint family.
   - Failover behavior tests (non-2xx, timeout, provider rejection).
   - Billing idempotency tests across retries.
2. Performance checks.
   - Fixed-load benchmark before/after each phase.
   - Compare p95/p99, DB/KV calls per request, and stream completion tail.
3. Rollout checks.
   - Canary by percentage/team.
   - Track error budgets and rollback quickly on regressions.

### Suggested Delivery Order

1. Phase 0 baseline.
2. Phase 1 correctness.
3. Phase 2 tail latency.
4. Phase 3 throughput.
5. Phase 4 deeper platform changes.

