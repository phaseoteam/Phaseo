# Authentication serving leases

Standard inference keys use a bounded validated-decision L1 keyed by an HMAC of
the full credential under the active pepper plus the observed key version. No
raw credential is retained. A different secret/pepper/version cannot hit that
decision. Internal-request privilege is checked independently for every request.
Workspace policy, restrictions and financial admission remain separate checks.
OAuth/delegated credentials and management-key source checks are not relaxed.

Metadata L1 is bounded at 2,000 entries / 4 MiB; validated decisions at 2,000 /
1 MiB. Metadata is explicitly projected, serialized and cloned on read. KV/source
refills are independently single-flighted with at most 32 active loads each.
Concurrent authoritative fills publish one equivalent KV value, not one per
waiting request. Unknown version markers still bypass serving caches to DB.

## Freshness contract

- Source lease: at most 60 seconds from the START of the authoritative DB read.
- L1 metadata/validated decision: at most 30 seconds, capped by that original
  source deadline and the key's own expiry. No read renews the source deadline.
- Version L1: existing five-second poll window; mutations publish new versions.
- Legacy KV rows without a source timestamp, future/expired timestamps and
  malformed expiries cannot authorize cached requests. Revalidate against DB;
  fail closed if that cannot succeed. A DB read lasting 60 seconds is rejected.
- Old-version fills remain pinned to their original marker. Source expiry also
  bounds acceptance when remote KV keeps returning an old value or marker.

For the new implementation, revocation exposure is bounded by the remaining
source lease (maximum 60 seconds), plus inter-machine clock error and already
admitted/in-flight work. This is an implementation bound, not evidence of a
measured worldwide SLA. The bound requires primary authoritative DB reads and
all serving Workers on this version. Do not promise five-second global revocation
from a five-second local version cache; KV is eventually consistent.

## Timestamp write reduction

Standard-key last_used_at is advisory display metadata, not a billing/audit
ledger. It is coalesced to at most one write per key/isolate/minute while its
bounded entry remains resident. At most 32 timestamp writes run concurrently;
excess advisory updates are skipped. Failed writes clear their coalescing marker
for a subsequent attempt. Eviction/isolate turnover can cause additional writes.
The displayed timestamp can lag continuous usage by about a minute (longer on
outage/overload). Credential hash migrations and OAuth mutations are never
coalesced. No financial write was removed or weakened.

## Validation

- Existing revocation races, OAuth consent and management-key tests still pass.
- New tests cover source expiry across KV/L1, stale/missing/future metadata,
  active-pepper rotation, wrong secrets, key expiry, strict cache bypass,
  internal privilege, delayed DB reads and write failure/retry windows.
- Auth rows/decisions are tested for count/byte bounds and copy isolation.
- 32 concurrent cold authentications: two KV reads (version + metadata), one DB
  read, one KV fill and one advisory timestamp write. Immediate warm auth adds no
  external operations. This is authentication only, not the whole gateway path.
- Native Workers cache/source test: 32 concurrent requests share one metadata
  source fetch, one authoritative fetch, one publication and one timestamp write;
  the next warm hit performs no external operation and a distinct key is isolated.
- Full source gate: 600 files / 4,660 tests pass; typecheck, focused lint, native
  Workers harness and staging build pass.
- Staging commit 7840cd6c0, Worker ed134992-0c06-402f-8966-ce48687eff49:
  twelve Poolside XS/S requests across Chat/Responses/Messages, streamed and
  non-streamed, all pass with zero-charge audits. Routing milliseconds:
  `[505,4,36,4,5,4,107,6,4,13,12,6]`. All probes used LHR.
- Disposable key aa58e993-08be-432f-b681-c0a71a4a64fb was revoked in DB without
  publishing a KV marker. Malformed JSON probes (cannot invoke a provider)
  first returned 401 at 50,821 ms, then again at 56,194 ms. This tests the
  remaining source lease, not a global SLA or normal mutation publication.
- Redacted operation tail: immediate warm Chat request used one KV read,
  one Supabase read, two mutations and two RPCs total; pre-dispatch counters
  contained only the KV read. The former per-request advisory mutation is absent.
  Counts are not CPU/duration/invoice measurements, and other protocols have
  additional operations. Production is unchanged.
