# Workspace mutation publication

Workspace settings, BYOK and guardrail mutations now share a constant-size
invalidation operation. Dynamic-route management in the gateway uses it too.
The database remains authoritative; this increment does not add an outbox or
claim that invalidation is globally instantaneous.

## Flow and cost

After a successful database write, publish the existing workspace policy version
and invalidate the encrypted private-route snapshot. Context cache keys include
that same policy version, so one publication fences every API key's context.
The version read and its approximately five-second L1 lease are shared by
context construction and policy evaluation. No second workspace marker exists.

One workspace mutation performs one KV marker read, one marker write and one
private-route delete, regardless of API-key count. It no longer lists all keys
or makes one gateway call/write for each key. These are operation counts, not
an invoice estimate; refills after mutation still have costs. Immediate warm
requests reuse the marker in memory.

The website uses one authenticated POST with a five-second deadline and rejects
redirects. The internal route requires the separate control secret and either
the configured service Bearer key or uncached authentication scoped to the
target workspace. It is mounted at `/v1/workspaces/:id/invalidate` and returns
`no-store`. It does not fetch Supabase for service-authorized publication.

## Failure and freshness

- Unknown/malformed version state bypasses both context cache reads and fills.
- Both publication operations finish before acknowledgement; any failure
  produces a redacted error.
- Website responses distinguish saved data from failed publication via
  `gatewayCacheInvalidated`. Publication failure must not imply that an already
  committed create should be blindly repeated.
- KV propagation, existing isolate leases and source TTLs still apply. The
  marker is not an atomic global sequence, and concurrent writers may collide.
- There is no durable retry/outbox yet. A failed publication is visible but
  does not provide guaranteed immediate propagation. Full runtime snapshots,
  durable publication and UI handling of this result remain further plan work.
- Key revocation and financial ledger authority remain separate.

## Verification

Unit tests cover dual-credential authorization, workspace isolation, publication
failure redaction, committed-write ordering, all eleven website BYOK/guardrail
mutations, per-key fan-out removal, warmed context invalidation and malformed
marker fallback. `scripts/test-workspace-publication.workerd.mjs` exercises the
actual mounted platform route in Workers with real local KV and forbids any
external database/provider request. No production data is touched by it.

The website must be deployed only after the gateway route is available. No live
website deployment or database migration is part of this increment.

PR #2559 validation: gateway 607 files / 4,742 tests; web API 96 files / 645
tests; both typechecks, focused lint, staging dry-run and native Workers check
pass. Source `e68ced826` deployed to staging version
`d395f959-29f1-4ac2-aceb-4e996231b725`. Twelve free Poolside probes passed with
zero-charge audit records and disposable-key revocation verified. LHR routing
times were `[775,3,5,4,4,4,115,4,15,5,15,10]` ms. First-per-model measurements
were 775/115 ms; this does not establish a cold-start SLO or global performance.
