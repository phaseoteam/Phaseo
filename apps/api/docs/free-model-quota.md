# Free-model quota

The quota belongs to the **workspace owner's user ID**, not the key creator,
request caller, API key, model, or workspace. Every workspace owned by that user
shares one allowance. Different owners have independent allowances.

## Policy

- 1,500 included gateway admissions per UTC day.
- A global token bucket with capacity 25 and refill 25/minute. This is not a
  promise of at most 25 requests in every sliding 60-second window.
- Paid overage defaults off. The quoted fee is 100,000 USD nanos per admitted
  overage request ($0.10 per 1,000), separate from provider inference pricing.
- Overage permission never authorizes fallback to paid inference.
- Disable prevents subsequent admissions; already-admitted work may finish.
- Settings use compare-and-set policy versions. A stale enable cannot undo a
  newer disable. Settings must be acknowledged only after durable confirmation.
- Gateway admission consumes allowance even if the provider later fails.
  Internal provider fallback must reuse admission. An ambiguous RPC response
  must fail closed, not automatically retry and consume another allowance.

## State and cost bounds

One SQLite-backed Durable Object per active owner, containing one singleton row.
Warm admission reads memory and accepted admission writes one row. Rejection
does not write. Settings changes write only when the value changes. Restart
reloads the row. There are no alarms, cron jobs, per-request records, model
copies, timers, outbound calls, or background quota refreshes.

Confirmed persistence is intentional. Relaxed writes could restore consumed
allowance after failure. The durable quota never owns wallet balances or ledger
entries. Existing accounting remains authoritative for actual charges.

Cloudflare's published paid-plan rates imply **$1.15 per million admissions**
for one RPC and one row write, before included allowances, duration, storage,
calling-Worker cost, and other gateway operations. This is a marginal rate
calculation, not a complete invoice prediction: billing-unit rounding and
account-wide included usage also matter. Denied requests still cost an RPC if
they reach the coordinator. A location-local edge limiter can shed abuse before
that RPC; it is not the authority for the global daily quota.

Duration sensitivity, assuming separately billed 128 MB objects and serial
non-overlapping activity: 1/10/100 ms active per admission adds approximately
$0.0016/$0.016/$0.16 per million respectively before included duration. Measure
real wall time and cold-object storage overhead; do not equate JavaScript CPU
time with billed duration or promise a fixed per-request bill.

Sources checked September 25, 2026:
[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/),
[storage/output gates](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[edge rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Activation gates

The core class is not exported or bound in deployment configuration yet. No
remote namespace is created by this change. Before enabling it:

1. Publish trusted owner identity with workspace runtime snapshots; fail closed
   on missing/expired identity. Never accept a caller-provided owner ID.
2. Wire once-per-request free-route admission and prevent paid-route fallback.
3. Add authenticated owner-only settings and dashboard wiring.
4. Integrate overage authorization, idempotent settlement and recovery, including
   all-failed and cancellation handling. Do not enable charges before this gate.
5. Approve new bindings/migrations, then run staging concurrency, restart,
   cross-workspace, consent, failure, cost and latency tests.

Local native tests cover 32 concurrent admissions, restart, policy freshness,
owner isolation and absence of alarms/network operations. They do not establish
regional latency, billing integration, or production readiness.
