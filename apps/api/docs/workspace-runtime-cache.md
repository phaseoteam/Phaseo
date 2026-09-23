# Shared workspace runtime cache

The reader/publication increment is gated by
`GATEWAY_WORKSPACE_RUNTIME_ENABLED=true`. It is **not enabled** in staging or
production configuration. Install the additive workspace runtime read contract
only with explicit shared-database approval before testing this flag.

## Data and ordering

The existing text context bundle may omit workspace settings/BYOK-reference
queries when a validated workspace snapshot is available. Admission remains
key-scoped in the context RPC; wallet reservations, budgets, effective tier and
key limits are not authorized by this cache. Catalog information remains global
and separate. Non-text and private-route source paths are unchanged.

Workspace snapshots are keyed by workspace ID plus the existing workspace policy
generation, shared between keys, models and endpoints. The context caller passes
its already-read generation; this adds no independent marker poll or cron.
Unknown generations bypass workspace cache reads and writes.

On a committed workspace mutation, the enabled publisher reads fresh source
data, writes the new generation's snapshot, then writes the version marker.
Private-route invalidation still completes independently. A source/snapshot/
marker/private-invalidation failure is reported, not acknowledged as successful
publication. Website mutation feedback continues to distinguish that failure
from a failed database save. Publication is not yet backed by a durable outbox.

## Bounds and freshness

- L1: 128 entries, 4 MiB retained-data estimate, 30-second non-sliding lease.
- Reads: at most 32 active refills; same-key reads coalesce.
- Writes: at most 32 active keys, one write per key at a time; excess advisory
  fills are skipped. Required publication reports a skip as a failure.
- Cache entry: 256 KiB conservative UTF-16 accounting; source data larger than
  that stays functional but uncached. Required oversized publication reports a
  refresh failure rather than silently claiming success.
- Source lease: 60 seconds, with at most one second of DB/Worker clock lead.
  KV's minimum 60-second retention never extends the embedded source expiry.
- Both cached context segments carry the workspace deadline; settings and BYOK
  references cannot acquire a longer lifetime when copied into a composition.
  A separate rollout cache namespace prevents legacy compositions bypassing it.

Only serialized JSON is shared. Each reader receives independent parsed data.
Delayed L2 reads cannot replace a newer local publication. Valid local entries
remain usable during KV failure; a cold miss falls back to the source. Database
admission failures are never replaced by a settings-cache success.

KV is eventually consistent, and the existing numeric generation bump is not a
cross-isolate transaction. This does **not** promise instantaneous global
invalidation or solve concurrent generation collisions; absolute source expiry
remains the backstop. Neither a new Durable Object nor a timer is introduced.

## Cost limits and remaining work

The warmed workspace component adds zero KV/DB operations. A workspace L2 read
adds one KV read on a local miss; a source fill adds at most one KV write. An
enabled mutation adds one source RPC and one snapshot write to the established
constant-size version/private-route invalidation work, independent of key count.

This is not yet proof of lower total cost per request. Existing context
compositions still contain derived settings and BYOK references. Their new
60-second source deadline can increase context refills compared with the old
longer-lived composition. Complete composition separation and a staging
operation-count comparison are required before treating this as a cost-saving
production configuration. No flat dollar saving is claimed by this layer.

## Validation

- Local SQL tests validate real PostgreSQL output against the Worker schema and
  preserve key/tenant/grant/budget/reservation invariants.
- Source tests cover cold/warm sharing, different keys/models/tenants, generation
  isolation, unknown markers, cache outages, expired source data, source failures,
  oversized valid settings, cache memory/concurrency bounds, publication ordering
  and context deadline propagation. The actual context pipeline is exercised.
- Native workerd: 32 concurrent reads coalesce into one KV read; 20 further warm
  reads perform zero external operations. Tenant/version isolation and stale
  source rejection pass, with zero pending work after completion.
- Existing mounted publication route passes native workerd checks with the
  feature disabled and zero DB/provider calls.
- API type-check, targeted lint and staging dry-run pass. Data, pricing and
  gateway validations pass with existing catalog warnings.

The source suite passed 612 files / 4,827 tests, followed by an additional actual
context-pipeline test passing in the focused suite. These are local/native
fixtures, **not** live validation of the new RPC-backed path. The migration and
feature activation await authorization; production has not been deployed.
