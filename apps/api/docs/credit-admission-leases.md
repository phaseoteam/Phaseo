# Credit admission leases

Credit is an admission hint, not a wallet or spending counter. Existing atomic
charging, idempotency, reservation and hard-limit checks remain authoritative.
This change adds no new KV writes, Durable Objects, timers, cron or schema.

## Cache contract

- Positive credit with a safe-integer available balance of at least $10 can
  remain in isolate memory for five seconds. Low/unknown balances and legacy
  payloads use the existing KV/source path on each request.
- Entries carry their original source-read start and expiration; the existing
  balance-based KV TTL is unchanged (60–7,200 seconds). Copying to L1 never
  extends that source deadline. Future/expired/invalid leases are rejected.
- L1 holds immutable JSON strings: at most 512 entries / 2 MiB, 16,384 characters
  per payload and 32 active refills. Callers hydrate separate objects.
- A workspace mutation invalidates local entries and in-flight loads before its
  KV delete, including when deletion fails. Source-time fences prevent late
  pre-mutation fills from repopulating local admission. Up to 512 fences are
  retained; evicted fences conservatively raise a shared minimum for unknown
  workspaces rather than silently permitting an older value.
- Other isolates can retain their current lease for at most five more seconds,
  capped by the original source expiry. KV propagation still applies after that.
  This is not a globally consistent balance, overspend bound or five-second
  global invalidation SLA. Already admitted requests remain in flight.
- Hard-limited contexts still bypass their cached dynamic snapshot. Async holds
  keep their existing authoritative reservation RPC and invalidation paths.

The $10 threshold matches the deployed database charge wrapper. The earlier $5
proposal is not enabled independently of that wrapper. Distributed text spending
exposure and durable settlement remain whole-plan gates; a fast cached admission
alone cannot guarantee that all provider spending will be recoverable.

## Validation

- Focused tests cover 32-way refill coalescing, byte/count/pending bounds,
  workspace isolation, source expiry, malformed/future leases, low balances,
  failed deletion, late source/publication races and fence eviction.
- Full-context fixture: immediate warm high-balance context makes zero KV/DB
  operations; mutating one request's hydrated object cannot change the next.
- Native Workers harness: 32 concurrent credit reads share one source fetch;
  warm reads add zero external operations; one workspace's invalidation does not
  evict another; stale KV cannot repopulate an invalidated local lease.
- Local PGlite existing credit-headroom tests pass: grants, idempotency, cumulative
  spending, $10/10% boundaries, reserved funds, top-up and workspace isolation.
  Queued PGlite calls are not real multi-connection lock-contention evidence.
- Full source gate: 601 files / 4,675 tests pass; typecheck and focused lint pass
  (existing context.ts max-lines warning remains).
- Staging commit ac6b4ca98, Worker e4c55712-a1f1-4799-beec-da4507b26cfa: all twelve
  Poolside XS/S protocol/audit checks pass with zero charge. Routing milliseconds:
  `[682,13,42,11,5,11,117,9,4,32,11,9]`, all LHR. Disposable key
  925e3f1f-2780-40e1-9a16-b887d84538e2 was revoked after testing.
- The no-wallet free test workspace does not demonstrate the high-balance
  optimization; native/fixture evidence is deliberately distinguished from live
  free-model compatibility checks. No paid traffic, wallet edits or production
  deployment were performed.
