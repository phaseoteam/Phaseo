# Routing cost and fault regression gates

These deterministic fixtures run locally in Workers, without model calls,
credentials or remote resources. They guard operation growth and correctness;
they are not a production throughput or billing benchmark.

Run the complete native set from `apps/api`:

```sh
node --test scripts/native-runtime.test.mjs
```

## Owner quota denial load

`scripts/test-free-quota-cost-chaos.workerd.mjs` exercises the actual quota class
through Worker-to-DO RPC, using test-only inspection and durable-state seeding.
It sends bounded waves of 32 calls, not an unbounded parallel promise list.

| Scenario | Required observation |
|---|---|
| 1,024 admissions after daily exhaustion | All denied; zero additional SQL row mutations |
| 128 settings reads and 128 unchanged consent updates | Zero additional SQL row mutations |
| Denial/read/update workload | Same singleton row, database size and no alarm |
| Restart after exhaustion | Allowance remains exhausted |
| 64 distinct owners, two admissions each | Two row mutations and one persisted row per owner |
| Corrupt persisted state | Fail closed; independent healthy owner still admits |
| All scenarios | No external network calls |

Mutation deltas use SQLite `total_changes()` on the same live object before and
after each workload. This is not Cloudflare billing telemetry: inspection itself
issues SQL reads, constructor/schema work is outside the warm-path comparison,
and request/duration/storage charges still exist. No claim is made that denied
traffic is free. The location-local ingress guard remains important for shedding
abuse before it reaches the global quota. This fixture deliberately bypasses that
guard to test the authoritative coordinator directly.

## Settlement replay faults

`scripts/test-settlement-recovery.workerd.mjs` checks confirmed queue handoff,
individual native acknowledgement/retry behavior, a debit response lost after
commit, complete Worker replacement, duplicate delivery, amount conflict and
malformed-record quarantine. Actual queue bindings and events are used with an
intercepted source RPC. No real customer ledger is altered.

`scripts/test-settlement-finalization.workerd.mjs` checks 32 concurrent finalizers
coalesce into one successful debit attempt, bounded failed attempts, later
recovery, conflicting-amount rejection and 32 independent settlements.

These tests do not prove recovery before a record exists, retention alerts,
platform DLQ transfer after a crash, real database transaction semantics, or
auto-top-up recovery. See [failed-charge recovery](settlement-recovery.md).

## Health locality baseline

`scripts/test-health-batching.workerd.mjs` requires 32 concurrent observations
to coalesce into one coordinator RPC, then one sparse observation to use one
RPC. It also requires no pending batch afterwards and no KV binding. Sparse
traffic does not obtain the same batching savings as busy traffic; neither
result may be extrapolated as a fixed per-request serving cost.

## Remaining live acceptance evidence

Before any production activation, measure source/queue/DO/Worker operations,
billed duration, cold-object overhead and latency at representative owner counts
and traffic locality. Exercise approved staging outages and alerts. Source
migrations, quota/recovery resources, paid probes and production rollout need
separate approval; a passing local suite is not permission to activate them.

No CPU-to-wall-time conversion or extrapolation from 64 local objects can prove
million-owner production capacity. Preserve the existing canary and rollback
gates and reconcile accounting before increasing exposure.
