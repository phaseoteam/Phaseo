# Routing readiness

This is a release gate record, not a claim that the entire overhaul is complete.
Evidence below is from September 26, 2026. Production Worker deployment is not
authorized by the staging work.

## Implemented

| Area | Current behavior | Evidence / boundary |
| --- | --- | --- |
| Shared routing caches | Shared public catalogue and pricing, isolated private routes, bounded auth/policy/credit leases | Source and native Worker tests; cache misses can still read the source database |
| Health coordination | Batched observations, bounded pending work, duplicate delivery protection | Native sparse, burst, outage and lost-ack tests; not an invoice-scale cost proof |
| Streaming | Bounded parsing and compatibility bridges, immediate deltas, no retry after output | Native protocol, disconnect and finalization tests; compatibility translations retain bounded output |
| Pre-output failover | Conservative retry only where the existing safety checks prove it eligible | Does not retry unknown or positive supplier usage or unsafe side effects |
| Included free quota | Owner-wide allowance across workspaces, persistent admission count, edge guard | Native concurrent/restart/isolation/denial-load tests; one accepted-admission row write, no included-fee journal or alarm |
| Opt-in free overage | Reserve before dispatch; capture successful, nonempty completed requests; release failures/disconnects | Native actual SQLite and PostgreSQL-compatible lifecycle tests; explicit owner consent and version fences |
| Fee recovery | Persisted immutable outcome, bounded automatic retries, private fenced operator retry | Restart/lost-ack/capacity/lifetime-ceiling tests; unknown outcomes retained for review, never guessed |
| Failed token debit recovery | Same-identity queue retries and dead-letter quarantine | Native queue and SQL replay tests; not protection against loss before durable handoff |
| Mutation publication | Durable source outbox and bounded publication/retry code | Schema applied and native tests pass; shared-source staging drain deliberately disabled |

## Latest staging evidence

Worker version `ec50a33b-5815-422e-9430-118ef6cc6039`, source `903537ed4`.
Twelve bounded free Poolside requests passed across two models and Chat,
Responses and Messages, streamed and buffered. All audit costs were zero; the
disposable key was revoked. This tests included quota, not paid overage.

Routing log milliseconds in request order:
`1915, 20, 147, 28, 21, 20, 99, 26, 30, 23, 20, 24` (LHR).
The first request exceeds the 500 ms cold target. The remaining requests are
20–147 ms. These are routing timings, not end-to-end generation latency or
representative regional percentiles.

The operator recovery endpoint returned 401 without its private credential and
200 with it, with `private, no-store` and no unresolved fees. No financial retry
was performed. Staging supports overage but no owner was opted in by this test.
Production flags and Worker were not changed. Shared publication and scheduled
consumers remain disabled in staging to avoid acknowledging production work
into staging-only caches.

Cumulative local gates: 632 source test files / 5,205 tests; all 37 native Worker
suites; API/web typechecks; scoped lint; staging dry-run; consent UI tests and
full Next production build. Passing these does not establish all release gates.

## Remaining gates

1. **Ordinary paid settlement:** choose the completion contract. Confirming a
   durable handoff before completion may add terminal latency and must define
   behavior when both the debit source and recovery storage are unavailable.
   Always returning success cannot also guarantee every such usage is recorded.
   Provider usage lost before it reaches the gateway is a separate problem.
2. **Post-debit work:** implement durable recovery of missed automatic top-ups
   and notifications, including payment idempotency expiry and consent changes.
   Replaying a debit alone does not recover these effects.
3. **Publication rollout:** establish environment-safe delivery and verify live
   website key/policy mutations and failure recovery. Do not turn on the shared
   staging outbox consumer as a shortcut.
4. **Free overage live validation:** use an approved funded test workspace and a
   bounded test plan; no balance seeding, quota exhaustion storm or paid model
   calls. Local failure/replay tests are not evidence of a live financial debit.
5. **Provider cancellation:** enable abort only after stop-billing and exact
   usage recovery are both established for that adapter. Current conservative
   draining remains; no unsupported guarantee is inferred from disconnect.
6. **Cost/performance/rollout:** cold-start diagnosis, representative regional
   CPU/billed-duration evidence, canary and rollback validation, review, and
   explicit production deployment approval. Legacy retirement follows rollout.

See [fee recovery](free-model-recovery.md) for the operator procedure. Disabling
new overage must leave existing fee settlement and recovery available.
