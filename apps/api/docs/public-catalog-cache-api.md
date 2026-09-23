# Public catalogue Cache API transport

Public catalogue reads now use bounded L1 → Cache API → the existing source
context RPC. The catalogue transport performs no KV operations. Private context,
auth and accounting still use their existing paths in this layer.

- L1: 128 entries, 4 MiB conservative retained-data estimate, 30-second lease.
- Concurrent L2 refills and publications: each limited to 32 per isolate.
- Source envelope: at most five minutes, shortened by source price/route windows.
- L2 HTTP TTL: remaining source lifetime rounded down, never reset to five minutes.
- Every L2 read revalidates schema, identity, content revision and absolute expiry.
- No negative cache for unknown/private model names. Private `@` identifiers do
  not access L2; empty or private snapshots cannot be published.
- Cache keys use the configured Worker origin, never request-controlled Host.
  Staging, global production and regional production use distinct origins.
- No stale-while-revalidate for expired routing/pricing leases. Cache faults
  fall through to the existing authoritative source; no fabricated routing data.

Only completely consumed immutable data is shared between concurrent requests.
The native workerd test exercises real Cache API bodies across 32 requests,
observes one L2 read, then zero external operations on the next warm read.
This is catalogue-only evidence, not yet a database-free whole-request path.

Cache API is local to a datacenter. Scheduled publication in one location cannot
warm other locations; the simulator explicitly tests this. Shared-production-DB
staging schedules remain disabled. HTTP `Cache-Tag` is supplied for the next
change-driven purge layer; that layer must use Cache API/zone purge semantics,
not assume the newer per-entrypoint Workers Cache purge API clears these entries.
Until that mutation integration is complete, source expiry is the repair bound.
Cross-isolate writes may arrive out of order; checked timestamps prevent local
read/publication races, not global linearizability.

## Previous projection layer probe

Staging version `2540e068-2dfe-42cc-8b44-019a4615f657`, source `d00cbfb87`:
six successful zero-cost Poolside Laguna S 2.1 Chat requests via LHR.
Fresh-key dispatch 1,144 ms; warm values 105, 26, 15, 16, 27 ms (mean 37.8 ms).
Key `b73bc3b5-7b20-498e-afeb-46ec21a31d12` was revoked. Cold target failed;
the source projection layer does not claim a latency improvement. No production
deployment or inference charge occurred.
