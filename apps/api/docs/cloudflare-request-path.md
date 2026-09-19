# Cloudflare request state

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
An independent Cloudflare copy of that wallet must never be used as spendable
credit. Live cutover requires either an exclusive wallet owner or a separately
reserved escrow allocation. Synthetic benchmarks use a distinct namespace and
cannot dispatch a paid provider request or write production accounting rows.
Existing staging cron consumers remain disabled.

## State ownership

Supabase owns configuration authoring and the long-term accounting projection.
Immutable context snapshots contain the existing normalized pipeline contract;
private configuration is encrypted before it enters shared KV/Workers Cache.
A workspace Durable Object owns publication revisions, active keys, available
credit, reservations, idempotency records and an atomic accounting outbox.
Ordinary inference and asynchronous work use the same accounting engine, with
explicit hold/capture/release/settlement transitions. A queued projection must
acknowledge the durable outbox only after persistence succeeds.

## Rollout checklist

### Implemented in this staging prototype

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

This is a first vertical slice, not the completed API-wide migration.

1. Decide the financial ownership boundary. Either provide an isolated staging
   database or reserve an explicit escrow allocation for a dedicated test
   workspace. A copied production wallet balance is not valid authorization to
   spend. Implement ownership fencing, allocation/top-up/refund handling and
   recovery before activating any real key.
2. Deliver key, membership/OAuth, guardrail, routing, provider and pricing changes
   from all control-plane mutations through a versioned, retryable publication
   outbox. Website create/delete is not wired to this prototype. Security
   changes must not wait for periodic cron reconciliation.
3. Replace snapshot key-limit/budget counters with atomic live enforcement,
   including rolling windows and concurrent admissions. Publish dynamic security
   decisions independently of static pricing. No frozen counter may enforce a
   production budget.
4. Add a Queue consumer and idempotent Supabase projection, acknowledge durable
   outbox events only after confirmed persistence, and cover retries, ordering,
   backpressure, low-balance alerts and automatic top-up behavior. Define event
   retention and safe snapshot/idempotency cleanup.
5. Migrate remaining pre-dispatch reads: provider-rate-limit configuration,
   health fallback, service-tier sibling resolution, auto/free routing, optional
   webhook validation and other specialized paths. Shared preflight coverage
   does not establish that these paths are database-free.
6. Migrate separate batch/file/realtime ownership and lifecycle handlers. The
   common wallet helper supports long-lived holds, but provider submission,
   polling, webhook completion and reconciliation are not yet migrated or
   tested end to end on the new state.
7. Benchmark complete dispatch, large snapshots, multiple Cloudflare locations,
   concurrent load, eviction, outage, and recovery. Reduce repeated DO reads
   only after state freshness and accounting semantics remain proven.
