# Failed-charge recovery

This feature is disabled until explicitly configured. It recovers a known final
charge after the request's three debit attempts fail. It does **not** provide
durable execution or reconstruct usage lost before a recovery message exists.

## Accounting contract

- Successful direct debits perform no queue operation. Zero-cost and testing-mode
  requests retain their existing bypasses.
- The producer sends only version, workspace ID, immutable server billing ID,
  exact integer nanodollar amount, credit snapshot and creation time. No prompt,
  output, token text, credentials or provider payload is retained.
- A confirmed queue send transfers recovery ownership; it does not mark a debit
  as applied. Concurrent finalizers share the same attempt and handoff.
- Consumers use the existing `gateway_charge_with_credit_cache` RPC, including
  its transactional workspace/request identity and amount-conflict fence. Queue
  transport IDs are never debit identities. Replays preserve credit invalidation.
- Each message is acknowledged only after a confirmed applied/already-applied
  result, or a confirmed transfer to the dead-letter queue. Ambiguous writes may
  duplicate a recovery/dead-letter message, never justify an extra debit.
- Processing is sequential within each batch. Each delivery makes at most one
  debit call. Deliveries 1–4 retry after 30/60/120/240 seconds; failure on delivery
  5 is quarantined. Later deliveries never attempt another debit. Invalid records,
  records older than 24 hours, and timestamps over a minute in the future are
  quarantined without a debit. Failed quarantine transfers retry after 300 seconds.

The existing direct debit path remains authoritative. Auto-top-up and notification
side effects retain their existing semantics: an already-applied debit replay does
not repeat them. This change does not recover side effects missed after a debit
committed, guarantee supplier usage recovery, or implement free-model overage.

## Activation gates

No queue, consumer, schedule or production binding is created by this layer.
Before activation, obtain approval and configure **all** of the following:

1. Environment-isolated recovery and dead-letter queues; only trusted gateway
   producers may publish JSON records. Never attach customer-facing producers.
2. `SETTLEMENT_RECOVERY_QUEUE`, `SETTLEMENT_RECOVERY_DEAD_LETTER`, and the exact
   consumer queue name in `GATEWAY_SETTLEMENT_RECOVERY_QUEUE_NAME`.
3. A bounded consumer configuration: initially batch size 1, maximum concurrency
   1, maximum retries 5, and a platform-level dead-letter queue. The latter must
   be configured in addition to the producer binding, to cover crashes, disabled
   handlers and failed explicit quarantine transfers. Verify source timeouts and
   load before increasing batch size/concurrency.
4. Verified retention on both queues, an alert on any quarantine/enqueue failure,
   and an operator response time comfortably shorter than retention. A dead-letter
   queue is not a permanent accounting ledger. Export/reconcile unresolved records
   before expiry; never blindly replay conflicts or replace their billing IDs.
5. Local fault fixtures followed by an approved staging test of queue delivery,
   source outage, replay, disabled consumer, platform DLQ transfer and retention
   alerts. Only then set `GATEWAY_SETTLEMENT_RECOVERY_ENABLED=true`.

Rollback must preserve backlog. Pause the consumer first and retain/export the
queues; do not delete or purge them. Disabling the feature alone causes received
batches to retry and eventually reach the platform DLQ, so it is not a substitute
for an operational rollback and reconciliation plan.

Monitor `settlement_recovery_batch` aggregate counts, quarantine/configuration/
enqueue errors, queue age/depth and source load. Per-request operation counters
include attempted `settlementEnqueue`; they do not claim to include downstream
consumer/DLQ costs. No raw record is logged by the recovery handler.

## Marginal queue cost

For records below 64 KB, a first-delivery recovery normally uses one write, one
read and one delete. At $0.40/million operations above the included allowance,
that is $1.20/million recovered charges, not per million gateway requests.
For example, 0.1% of one million requests needing first-delivery recovery adds
approximately $0.0012 in queue operations. Retries, quarantine and operator reads
add operations; Worker execution, source calls, cache invalidations and payment
side effects are additional. These are arithmetic examples, not measured failure
rates or total serving-cost estimates. See [Cloudflare Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/).

Confirmed-send and acknowledgement behavior follows the [Queues JavaScript API](https://developers.cloudflare.com/queues/configuration/javascript-apis/).
The mandatory platform fallback follows [dead-letter queue configuration](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/).

## Deterministic evidence

Run from `apps/api`:

```sh
pnpm exec vitest run src/core/settlement-recovery.test.ts src/pipeline/after/charge.test.ts src/pipeline/pricing/persist.test.ts
node scripts/test-settlement-recovery.workerd.mjs
```

The native fixture exercises actual Worker queue events, producer delivery and
quarantine bindings. A mocked source retains its idempotency ledger while the
entire Worker is replaced after a commit/response-loss fault. This verifies the
runtime integration, not the deployed database or real payment behavior. All
network calls are intercepted; no provider or Stripe request is made.
