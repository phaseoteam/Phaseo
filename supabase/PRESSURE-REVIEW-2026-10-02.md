# Supabase pressure review — 2 October 2026

Project: **Phaseo Prod** (`xansbgjaduxypzsmjwct`, Postgres 17, eu-west-2). Read-only inspection; no production configuration, SQL definitions, rows, counters, or scheduled jobs changed.

The largest observed load comes from repeated catalog/model reads, especially pricing, alongside expensive gateway request context and ingestion. Customer rate limiting addresses gateway amplification but will not by itself remove catalog-page traffic or its query cost.

## Evidence and windows

The statement statistics reset at **2026-10-02 19:41:11 UTC**. The inspected statement sample was taken shortly before **21:56 UTC**. These are cumulative execution statistics since reset, not a 24-hour total or a direct CPU utilization measurement.

| Statement | Calls | Total execution time | Mean execution time |
| --- | ---: | ---: | ---: |
| `get_v2_model_pricing` | 1,000 | 1,079.5 s | 1,079.5 ms |
| `ingest_v2_gateway_request_with_routing` | 380 | 514.0 s | 1,352.7 ms |
| `get_v2_model_availability` | 431 | 308.7 s | 716.3 ms |
| Nested `v2_pricing_skus`/meters/routes read | 366 | 265.9 s | 726.6 ms |
| `gateway_fetch_public_catalog` | 148 | 233.5 s | 1,578.0 ms |
| `gateway_requests` inserts | 244 | 227.1 s | 930.7 ms |
| `get_v2_model_benchmarks` | 446 | 208.2 s | 466.9 ms |
| `gateway_fetch_request_context_with_reservations` | 83 | 191.7 s | 2,310.2 ms |

Several later SQL introspection calls failed at connection establishment with a timeout. A successful activity snapshot showed mostly idle connections and no long-running active query among the returned 25 rows. This sample cannot rule out intermittent connection, CPU, or I/O pressure. No query plan or infrastructure CPU/IOPS metric was obtained, so the exact resource bottleneck remains unverified.

## Request volume

Supabase's unified logs returned roughly **360,000 edge-log entries** in the tool's default trailing 24-hour window. Grouping by path/method yielded:

| Path / method | Requests | Mean origin time | Server errors |
| --- | ---: | ---: | ---: |
| `v2_model_provider_routes` GET | 44,268 | 4,084.5 ms | 368 |
| `v2_models` GET | 41,119 | 3,972.3 ms | 428 |
| `get_v2_model_pricing` POST | 15,358 | 8,048.2 ms | 495 |
| `get_v2_model_aliases` POST | 12,223 | 1,298.9 ms | 2 |
| `v2_pricing_skus` GET | 12,217 | 1,200.9 ms | 95 |
| `keys` PATCH | 9,528 | 936.5 ms | 34 |
| `ingest_v2_gateway_request_with_routing` POST | 7,731 | 2,222.3 ms | 440 |
| `gateway_requests` POST | 7,513 | 1,255.6 ms | 71 |
| `upsert_gateway_request_into_workspace_usage_rollup` POST | 7,433 | 516.5 ms | 8 |

Origin time includes service/queueing overhead and is not equivalent to PostgreSQL execution time. Log entries are observations, not proof of distinct end-user requests or successful ingests.

A second aggregation for **19:41–22:00 UTC** showed 2,804 model reads, 2,785 route reads, 1,133 pricing calls, and 645 context calls. Their origin averages were about 6.85 s, 6.09 s, 15.23 s, and 11.10 s respectively. The differing windows explain the differing means and call counts.

About 41,803 route reads, 37,690 model reads, and 15,360 pricing calls in a subsequent 24-hour grouping identified `supabase-js/2.110.3; runtime=node; runtime-version=22.19.0`. This identifies a client/runtime signature, not a verified deployed application. Correlate it with web/web-API and gateway deployments before assigning ownership. No credentials or customer payloads were collected in this report.

## Query and write amplification

The live pricing function builds provider/variant/capability JSON, then performs provider-correlated pricing aggregation. Its stealth-redaction wrapper additionally joins pricing IDs using `sku.sku_id::text`. The context-with-reservations function enriches every pricing rule by joining `private.v2_rpc_pricing_compat` through `rule_id::text`. These are concrete optimization candidates: inspect plans, avoid repeated expansion of compatibility views, and cast JSON IDs to the indexed column's native type where the contract guarantees valid IDs. Their individual contribution has not been isolated with EXPLAIN.

The current repository web-API pricing and gateway-metadata callers use `get_v2_model_pricing`. Check cache misses and duplicate per-model fetches across these callers first. Recent main-branch catalog/localization caching changes should be included when comparing deployed versions; the original working checkout was behind main.

The application has both legacy `gateway_requests` writes and v2 ingestion, plus a separate workspace rollup RPC and upstream audit writes. The live v2 routing-ingestion function resolves provider routes for each attempt and routing decision, deletes/reinserts routing decisions on delivery, and upserts a routing trace. Preserve accounting and idempotency while reducing this reporting work; do not simply disable audit/billing writes.

Authentication also dispatches a `keys.last_used_at` update for successful key authentication, matching the observed high PATCH volume. The quota implementation prepares authentication once per HTTP request, defers its usage/migration writes until the admitted handler, and reuses the prepared result only inside that same request. RPM rejection therefore adds no last-used write, and adding the admission middleware does not double authentication queries or timestamp updates. Ordinary admitted requests retain their existing update behavior.

A cumulative table-statistics snapshot recorded about 9.82 million sequentially read route tuples and 7.45 million pricing-SKU tuples. The October gateway-request partition also recorded about 8.79 million sequentially read tuples. These statistics suggest repeated scanning worth examining, but do not establish that an index is missing. Database temp bytes were about 1.40 GB in a different cumulative statistics window whose reset was unavailable; they cannot be attributed to this two-hour statement window. Deadlocks were zero in that snapshot.

## Storage and scheduled work

| Relation | Total relation size, including indexes/TOAST |
| --- | ---: |
| `v2_request_routing_decisions` | 1,155 MB |
| `gateway_requests_2026_09` | 939 MB |
| `v2_request_facts` | 415 MB |
| `v2_request_usage` | 178 MB |
| `gateway_upstream_requests_2026_09` | 177 MB |
| `gateway_requests_2026_10` | 164 MB |
| `v2_catalogue_row_history` | 152 MB |
| `v2_request_routing_traces` | 103 MB |

Routing decisions are the largest observed relation. Establish retention and whether every unselected candidate's detailed score trace must be kept indefinitely. Do not delete financial/request records or bulk-clean indexes without a separate reviewed retention plan.

Active database schedules include daily 90-day leaderboard refresh, hourly 12-week workspace-usage refresh, hourly BYOK metadata pruning, and five-minute provider-release activation. The public model user-usage daily refresh was inactive. The two hourly jobs share minute 17. Inspect job durations and scan plans, then consider incremental refresh/staggering if they materially contribute. The reset-window provider-release RPC sample alone accumulated about 159 s across 126 calls, including application calls beyond the database schedule.

The live `private.materialize_free_admission_usage` trigger reports owner/day cumulative free usage from audit metadata. It is reporting, not evidence of gateway RPM enforcement. It remains untouched; new user/workspace quota counters do not write to this reporting table.

## Immediate priorities

1. Roll out customer RPM/RPD admission outside Supabase, before expensive context work and provider dispatch. The accompanying implementation provides rolling RPM, free-route RPD, administrator overrides, and shared counters across regions without database quota queries or writes.
2. Identify the deployed caller behind the high-volume Node client signature. Verify recent catalog cache changes are deployed, then reduce duplicate pricing/model/route fetches and retries during database errors.
3. Obtain pricing/context plans and CPU, memory, IOPS, disk, and connection metrics. Optimize the observed expensive SQL rather than assuming rate limiting or an arbitrary new index will resolve the database bottleneck.
4. Review v2/legacy ingestion costs and routing-decision retention, followed by scheduled analytics refreshes. Preserve billing, authorization, and reporting semantics.

For quota architecture, Cloudflare documents that native [Workers rate-limit counters](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) are location-local and permissive. A separate [Durable Object](https://developers.cloudflare.com/durable-objects/) per user/workspace gives coordinated, persistent admission without one global bottleneck. Configuration uses existing KV; counter state uses Durable Object SQLite.
