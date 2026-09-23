# Context segment leases

Eligible warm routing/settings segments now avoid their two recurring KV reads.
Private dynamic context has a five-second local lease; routing/preset segments
have thirty seconds. Both stop at their absolute source deadline, and public
catalogue deadlines cap routing reuse. Reads never extend source freshness.
Legacy KV payloads without provenance keep the existing read path and do not
enter L1. New snapshots carry source-check and expiry timestamps; no new KV
namespace, resource, cron or per-request write is introduced.

Retention is bounded to 512 entries, 4 MiB estimated data and 32 pending segment
refills, with a 256 KiB per-entry estimate. Cache payloads are immutable strings;
each request parses its own objects before private-model/BYOK hydration. Source
I/O is consumed by its originating request; only completed strings are shared.

Credit intentionally stays outside these leases. Every context hit still reads
the separate credit key, and missing credit refreshes the authoritative wallet.
Existing reservation/charge invalidation and the deferred credit-write billing
barrier are unchanged. Configured hard limits/budgets still bypass cached
admission. Key-version namespaces retain their existing mutation behavior.

This is an incremental optimization, not the complete workspace-runtime
projection or zero-external-read path. Static context remains workspace-scoped
until public/private composition is migrated. Global invalidation, private-model
leases and accounting work remain separate. At high-cardinality cache capacity,
the existing context source fallback still applies and must be load-tested.

Validation: 20 focused cases, 4,541 source tests in 591 files, typecheck, scoped
lint (existing context file-length warning) and staging dry-run pass. Native
Workers: 32 simultaneous same-workspace reads perform one source call for two
keys; warm reads perform zero; another workspace remains isolated. No production
deployment or invoice-based cost claim.
