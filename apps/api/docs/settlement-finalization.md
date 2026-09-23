# Request settlement finalization

Concurrent finalizers now share one in-flight settlement attempt and its existing
bounded retry sequence. Coordination is owned by request metadata in a WeakMap,
not a global billing-ID cache. Different context wrappers for the same request
share the attempt; independent requests do not. Conflicting identities or costs
are rejected rather than silently treated as already settled.

The existing authoritative database idempotency key remains necessary across
isolates, retries and restarts. Successful attempts preserve the recorded marker.
Exhausted attempts release the in-memory guard so a later caller can retry. Credit
snapshot writes still complete before debit/invalidation; billing inputs are
captured before asynchronous work.

## Evidence and limits

The native Workers reproduction made 32 ledger calls for 32 concurrent finalizers
before this fix. Afterward it makes one. With injected failures, callers share
three attempts; a subsequent retry can recover. Thirty-two independent requests
still make 32 settlements. The fixture uses a local ledger service binding and
does not debit real wallets.

Eleven focused unit tests cover barriers, wrapper sharing, conflict rejection,
retries, zero-cost/testing bypasses and server-owned billing identifiers.

This saves duplicate work only when finalizers race; it does not reduce a normal
single finalizer below its existing one authoritative call. It introduces no KV,
Durable Object, queue or scheduled operations. It is **not crash-durable retry**:
the existing exhausted-retry logging behavior remains, and financial recovery
after process loss is still an open rollout requirement. Free Poolside regression
checks cannot establish paid-ledger correctness or paid-request cost.
