# Private-route cache bounds

Private route metadata stays workspace-scoped and credentials remain encrypted.
No public Cache API or Workers Cache entry is used. The source-age deadline is
still sixty seconds, measured from the start of the source read; L1/KV hits do
not renew it. Incomplete/oversized workspace listings still require exact lookup
and cannot prove that a private model is absent.

The cache now uses the shared bounded LRU implementation:

- 128 retained workspaces, four MiB estimated retained serialized data;
- 64,000 characters maximum serialized snapshot;
- 32 outstanding shared refills, including invalidated but unfinished work;
- 32 background fills and 32 direct exact source reads maximum;
- no stale-while-revalidate, plaintext retention or fallback amplification on
  capacity errors.

These are per-isolate bounds, not account-wide traffic limits or an exact heap
measurement. At refill capacity the request fails safely rather than issuing an
additional database query. Explicit cache bypass and incomplete snapshots have
a separately bounded exact-query path.

Local invalidation fences pending L1 refills and waits for an already-started
KV fill before deleting it. New local cache reads are bypassed while publication
is pending. A failed delete clears L1 and bypasses KV for sixty seconds, using
authoritative exact reads; source failures remain errors. A single bounded
deadline is used rather than an unbounded failed-workspace registry.

This does not eliminate KV's cross-region propagation delay or provide a global
instantaneous private-credential revocation guarantee. Mutation publication,
absolute source deadlines and existing authorization remain separate safeguards.

## Tests

Thirteen unit tests cover source leases, tenant isolation, cloning, incomplete
listings, explicit bypass, concurrent misses, byte pressure, refill-capacity
exhaustion, repeated invalidation, late writes and failed deletes. Existing
context/private-model tests also pass.

`node scripts/test-private-route-leases.workerd.mjs` verifies native Workers I/O:
32 concurrent requests coalesce to one KV read, one DB read and one KV fill;
the next warm request performs zero external operations, and local deletion is
observed. The actual mounted workspace-publication native test also passes.

Source `88ed63cd7`: 607 gateway source files / 4,747 tests, typecheck, focused
lint and Worker dry-run pass. Staging version
`159927b5-095d-4a3b-80e6-054a1be16e3d` passed twelve free Poolside probes across
two models and three streaming/non-streaming protocols, all zero-charge, with
disposable-key revocation verified. LHR routing measurements were
`[366,5,37,4,4,5,122,9,5,9,24,15]` ms. These public-model probes are regression
evidence, not live private-credential revocation tests or global SLO evidence.
