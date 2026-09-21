# Cloudflare request state

## Continuation brief: production-backed test workspace

The operator authorized continuing the complete migration using a dedicated
workspace in the production database. USD 1 is the agent's cumulative live-test
spending budget, not a product limit, wallet allocation or new billing rule.
This does not authorize production Worker rollout or spending from other
workspaces. Existing normal traffic remains on its existing path.

Required acceptance gates before a confidence claim:

- Keep existing billing semantics: observed usage for ordinary inference and
  explicit holds for long-running work. Paid probes have conservative bounds and
  cumulative spend tracking; expensive tests use deterministic provider fixtures.
- Website key/configuration mutations have durable retryable publication and
  acknowledged security fencing; missing state fails closed.
- Durable accounting events call the existing idempotent billing functions.
  Retries cannot double-charge, and refreshing a cached balance cannot overwrite
  pending usage. No separate escrow or shadow accounting tables are needed.
- Batch/file/realtime lifecycle reads and writes use Cloudflare-owned state for
  enrolled workspaces, preserving ownership, claims, cancellation, recovery,
  settlement and webhook semantics.
- The staging Worker executes complete representative requests, not just
  preflight probes, with measured database attempts and cumulative test spend.

No UI redesign or public wire-contract changes are intended. The affected
surfaces are gateway shared preflight/execution/accounting, async lifecycle
repositories, website control-plane mutations, and existing Supabase contracts.

## Change brief

Build a gateway data plane that can authenticate, load routing/pricing/policy,
and account for inference without waiting for Supabase. Start from origin/main
at a12756ea0 in an isolated worktree. Preserve existing protocol adapters and
distinguish immediate inference settlement from durable media/batch holds.

Acceptance criteria:

- Published configuration is immutable, scoped to its workspace and key, and
  loaded from memory, Workers Cache or KV with no database fallback.
- Key revocation and wallet transitions are enforced by durable, transactional
  Cloudflare state, with idempotent reserve/capture/release/settle operations.
- Publication cannot overwrite live balances or reactivate a revoked key with
  an older update. Concurrent requests cannot spend the same reserved credit.
- Unknown/unpublished state fails closed and is observable.
- Staging tests measure cold and warm preflight separately and exercise
  immediate settlement and long-lived holds, including replay and restart.
- Existing API behavior remains the default until a workspace is explicitly
  cut over; production deployment is outside this task.

## Staging boundary

The staging Wrangler configuration points at the production Supabase project.
Cloudflare's wallet state is a working copy of the same wallet, never a second
source of funds. Normal idempotent billing functions update the existing ledger.
Workspace cutover still needs consistent routing of all spenders and correct
handling of top-ups/adjustments. Synthetic benchmarks use a distinct namespace
and cannot dispatch paid requests or write production accounting rows.
Existing staging cron consumers remain disabled.

## State ownership

Supabase owns configuration authoring and the existing wallet/accounting records.
Immutable context snapshots contain the existing normalized pipeline contract;
private configuration is encrypted before it enters shared KV/Workers Cache.
A workspace Durable Object owns publication revisions, active keys, available
credit, reservations, idempotency records and an atomic accounting outbox.
Ordinary inference and asynchronous work use the same accounting engine, with
explicit hold/capture/release/settlement transitions. A queued projection must
acknowledge the durable outbox only after persistence succeeds.

## Rollout checklist

### Deployed synthetic prototype (before continuation)

- Dedicated staging KV namespace `2438099f3dd54c589da837f519acf9c6` and SQLite
  `WorkspaceRequestState` Durable Object. Production has no binding or mode flag.
- Authenticated, staging-only configuration publication through
  `/internal/request-state/publish`. The compiler reuses the existing context
  builder and workspace-policy loader; source database access happens here.
- Immutable AES-GCM encrypted snapshots with SHA-256 references, bounded memory
  and Workers Cache acceleration, and a durable fallback copy for KV propagation
  delays. Objects have no KV expiration. Execution still respects the snapshot's
  absolute validity deadline; retained storage is not an indefinite freshness
  guarantee. Current safety leases derive from existing pricing/context TTLs.
- Strongly consistent key revocation, monotonic key/snapshot publication revisions,
  and HMAC verification without a Supabase lookup for synthetic keys.
- Existing context and policy entrypoints read the published state for synthetic
  workspaces. Ordinary guard enforcement remains enabled in these probes.
- Existing immediate-charge and reserve/capture/release/settle helper entrypoints
  delegate to transactional durable state for synthetic workspaces. Normal
  inference retains the current observed-usage charge behavior. Holds consume
  reserved balance until capture, settlement or release. Actual charges cannot
  consume another request's hold. An under-estimated hold returns
  `reservation_exceeded`; no automatic extension or overdraft is introduced.
- A durable outbox entry commits atomically with each accounting transition.
  This prototype retains events locally; it does not project them into Supabase.
- A request-local AsyncLocalStorage guard rejects and counts database attempts
  during probes, including attempts caught by fallback code. The guard also
  checks the runtime Supabase client's fetch wrapper. Concurrent publication
  remains permitted. `nodejs_als` is enabled in Worker configs.
- Synthetic keys are denied on every public `/v1` surface. The internal harness
  never executes a provider. Synthetic balances cannot spend production credit.

### Staging measurements (2026-09-19)

Worker: `phaseo-gateway-staging`, `https://api-staging.phaseo.app`.
Deployment: `ff8a34d3-a86b-4ebb-844f-1355369dcacc`.
Prior code version before this work: `eedfda04-e862-4694-85ac-133063b0fade`.
The new Durable Object migration is additive; rolling back code does not remove
its state, KV namespace, or encryption secret.

Configuration was compiled from an active key in the operator's personal
workspace into a separate synthetic workspace. No production keys, wallets,
reservations, or database schema were modified. Probe keys were revoked after
each run. The staging scheduler remains disabled (`crons = []`).

| Preflight endpoint | First request (ms) | Warm mean (ms) | Warm maximum (ms) |
| --- | ---: | ---: | ---: |
| Responses | 54 | 29.1 | 35 |
| Chat Completions | 23 | 25.4 | 31 |
| Messages | 22 | 23.9 | 30 |
| Embeddings | 28 | 25.5 | 38 |
| Moderations | 30 | 23.9 | 29 |
| Speech | 36 | 26.3 | 32 |
| Image generation | 28 | 23.3 | 31 |
| Video generation | 24 | 23.5 | 27 |

Each endpoint had 12 sequential probes: first request plus 11 warm requests.
All 96 probes passed with zero Supabase attempts. These are server-side shared
preflight timings from one local test client, not a global latency SLO, forced
Worker cold starts, or full upstream-dispatch measurements. Provider health,
provider quota admission, transport construction and the provider request itself
were outside this measurement.

Ordinary charge: 21 ms; hold: 20 ms; settlement: 24 ms; release: 21 ms.
Charge, settlement and release retries were idempotent. Public provider dispatch
with the synthetic token returned 403, and a freshly revoked token failed the
next preflight without a database lookup.

The current implementation performs a directory KV read, a key DO read, and
parallel policy/context DO reads per preflight. Billing adds its own DO call.
The earlier two-DO-call cost illustration is not a measured operation budget
for this prototype. Combining admission and policy/context references is still
an optimization to implement and benchmark.

### Validation

- 28 new tests pass: numeric/invariant validation, idempotency conflicts,
  reserve/settle/release, durable restart, SQL rollback on outbox failure,
  immediate revocation, publication ordering, encrypted snapshots, KV replication
  fallback, expiry, cross-workspace checks, and actual auth/context/billing helper
  integration with Supabase forbidden.
- Targeted existing auth, credit-refresh, workspace-policy, wallet-reservation
  and after-charge tests pass. API lint/type checking, default and EU/US regional
  dry-run builds, and staging dry-run/deployment pass. Lint retains existing
  max-lines warnings.
- The broad non-live API suite is not green on origin/main. The initial run had
  659 failing tests; a repeat had 660 (timing-sensitive variation). Every failing
  assertion in the repeat also failed in a source archive of `a12756ea0` using
  the same dependencies. The baseline archive cannot run every repository-level
  fixture, so its aggregate count is not directly comparable. Both versions
  also have an OpenAPI runtime test that cannot import `cloudflare:workers`
  in Node. No claim is made that the entire repository suite passes.

Run the synthetic staging probe from `apps/api`:

```powershell
$env:REQUEST_STATE_SOURCE_KEY_ID = '<active source key UUID>'
$env:REQUEST_STATE_TEST_MEDIA = '1'
node scripts/request-state-staging.mjs <path-to-dev-vars> <path-to-env-local>
```

The script reads local credentials without printing them. It requires the
existing internal staging token. It returns only redacted measurements and
revokes its synthetic key in a `finally` block. It never calls a paid model.

### Required before real traffic cutover

The USD 1 allowance applies only to the agent's actual test calls. The earlier
escrow design misunderstood this and has been removed, including its unapplied
migration and shadow projection tables. There is no escrow-migration approval
gate. This continuation has not replaced the measured staging deployment above.
No enrollment, wallet transfer or paid request has been executed.

Implemented and locally verified in the continuation:

- Background synchronization reuses ordinary charge/reserve/capture/release/settle
  functions, preserving billing references, normal top-up/alert behavior and RPC
  idempotency. No dollar cap or inference hold was added. An acknowledged writer
  refreshes the working wallet only if no concurrent unacknowledged event exists.
- Encrypted snapshot rebuilding from current configuration and website-account
  mutation fencing before writes and acknowledgement
  before success. Monotonic publication revisions and short validity leases fail
  closed. Completed mutation tokens cannot be resurrected by delayed retries.
- A workspace-owned SQLite lifecycle repository behind the existing async/batch
  repository interfaces, durable webhook delivery claims, file quota claims, and
  atomic realtime create/claim/extend/settle transitions. The ordinary website
  lifecycle/request-log queries still need integration; no shadow table is created.
- Durable alarms now invoke bounded workspace-scoped batch/video/realtime/webhook
  recovery. Staging recovery skips the global reservation reaper and production
  realtime billing-review scans. Configuration/recovery failures do not prevent
  the accounting writer from running. The production-wide scheduler stays disabled.
- Explicit staging/test-workspace publication only. Published-mode public `/v1`
  dispatch is blocked with `request_state_cutover_not_ready` until policy and
  lifecycle integration are verified. This is not a test-spending gate. Deployed configuration
  remains synthetic; the website middleware flag is unset by default.

Validation for this continuation:

- 101 targeted gateway tests pass, covering SQLite restart/rollback, normal wallet
  amounts above USD 1, existing billing-function reuse, uncertain acknowledgements,
  stale-refresh protection, publication fences and lifecycle transitions. Existing
  async/batch repositories and empty-workspace recovery run with Supabase forbidden.
- A further 65 auth/policy/charge regression tests and 31 batch/video/webhook
  reconciliation tests pass (197 gateway tests across these focused runs).
- 12 website API tests pass, including four new mutation-fencing cases.
- No new SQL migration is included in this continuation.
- API and website API lint/typecheck pass, with existing max-lines warnings.
  The staging dry-run bundle passes. These are not live Cloudflare recovery tests.

Still required; none of these are implied by the passing component tests:

1. Verify workspace cutover/synchronization against the existing wallet, including
   external top-ups, debits and pre-existing holds. Do not let two uncoordinated
   gateway paths authorize spending against independent working balances.
2. Finish publication coverage for all control-plane paths, including gateway
   management mutations and OAuth/membership semantics. Recover abandoned website
   fences without allowing an in-flight database mutation to commit after un-fencing.
   Preserve newly created key response/recovery semantics when synchronization fails.
   Current OAuth-derived keys fail closed. Only a bounded explicit model-target
   set is published; this is not yet an across-the-board catalog warmer.
3. Preserve ordinary inference's existing observed-usage charging. Replace
   snapshot key-limit/budget counters with atomic live enforcement,
   including rolling windows and concurrent admissions. Publish dynamic security
   decisions independently of static pricing. No frozen counter may enforce a
   production budget.
4. Verify background billing end to end against Cloudflare and the existing
   production database, add reporting integration, backlog/lag visibility and
   lifecycle row synchronization, and define event/snapshot/idempotency retention.
   Current refresh polling/rebuild cadence is test-scoped, not an
   established production cost or freshness budget.
5. Migrate remaining pre-dispatch reads: provider-rate-limit configuration,
   health fallback, service-tier sibling resolution, auto/free routing, optional
   webhook validation and other specialized paths. Shared preflight coverage
   does not establish that these paths are database-free.
6. Complete provider-facing batch/file/realtime execution, callback and recovery
   wiring. Credentials/pricing, finalization/key counters, background reconciliation
   and some telemetry still contain legacy paths. Stored lifecycle transitions
   are tested, but whole lifecycles are not yet database-free or end-to-end proven.
   Realtime's existing USD 5 reservation is a hold, not USD 5 of usage. Any live
   test must still keep actual billed usage within the agent's remaining allowance.
7. Benchmark complete dispatch, large snapshots, multiple Cloudflare locations,
   concurrent load, eviction, outage, and recovery. Reduce repeated DO reads
   only after state freshness and accounting semantics remain proven.
