# Gateway Latency Baseline — 2026-07-22

This document records the first repeatable latency baseline for the Phaseo gateway before the planned routing and hot-path optimisations.

## Baseline identity

- Measured at: 2026-07-22 07:23–07:28 UTC
- Git commit: `9c3db6eb03d2e3af91fb30d048b1954d4f35901e`
- Local OS: Windows 11 Home
- Local CPU: AMD Ryzen 5 5600X 6-Core Processor
- Node.js: v24.15.0
- pnpm: 10.33.0
- Production edge location observed: Cloudflare LHR

The working tree contained unrelated user changes during this measurement. The commit above identifies the repository base; the added routing benchmark is the only gateway code-adjacent addition made for this baseline.

## Local hot-path microbenchmarks

Canonical method: run each microbenchmark file in its own Vitest process. Running timing tests concurrently introduces scheduler contention and produced non-repeatable latency values.

Example:

```powershell
pnpm --filter @phaseo/gateway-api exec vitest run tests/performance/auth-latency.test.ts --reporter=verbose
```

These measurements use in-memory or mocked backing services. They measure JavaScript execution and warm-cache behavior, not real Cloudflare KV, Supabase, internet, or provider latency.

| Operation | Iterations | Average | p50 | p95 | p99 |
|---|---:|---:|---:|---:|---:|
| Warm API-key authentication | 300 × 5 runs | 0.161 ms | 0.147 ms | 0.222 ms | 0.320 ms |
| Warm request-context fetch | 300 | 0.065 ms | 0.054 ms | 0.111 ms | 0.138 ms |
| Warm provider-health read | 300 | 0.004 ms | 0.004 ms | 0.007 ms | 0.024 ms |
| Warm key-version read | 300 | 0.003 ms | 0.002 ms | 0.006 ms | 0.037 ms |
| Warm price-card load | 300 | 0.001 ms | 0.001 ms | 0.002 ms | 0.008 ms |
| Warm async-operation read | 300 | 0.003 ms | 0.002 ms | 0.004 ms | 0.014 ms |
| Warm application-ID resolution | 300 | 0.003 ms | 0.002 ms | 0.010 ms | 0.014 ms |
| Mocked audit persistence | 300 | 0.027 ms | 0.024 ms | 0.054 ms | 0.104 ms |

The authentication row reports the median result from five isolated runs; its p95 ranged from 0.212 ms to 0.270 ms. All 22 pre-existing performance tests passed when measured without a competing routing benchmark.

## Provider routing benchmark

Command:

```powershell
$env:RUN_ROUTING_PERF='1'
pnpm --filter @phaseo/gateway-api exec vitest run tests/performance/routing-latency.test.ts --reporter=verbose
```

The benchmark runs the full current `routeProviders` scoring, filtering, diagnostics, inverse-square price weighting, and weighted ordering logic. Health reads are warm and mocked; cache-aware sticky routing is disabled to isolate router CPU cost.

| Candidate providers | Iterations | Average | p50 | p95 | p99 |
|---:|---:|---:|---:|---:|---:|
| 4 | 500 | 0.195 ms | 0.122 ms | 0.415 ms | 1.295 ms |
| 16 | 500 | 0.432 ms | 0.273 ms | 1.037 ms | 3.503 ms |
| 64 | 500 | 1.604 ms | 1.151 ms | 3.857 ms | 5.900 ms |

All three routing benchmark cases passed their current 5 ms p95 guardrail.

The routing benchmark is opt-in so its CPU load does not distort the other latency microbenchmarks when Vitest runs test files concurrently.

## Production edge probes

Production probes were issued from the local machine through Cloudflare LHR. The first three requests were used as warm-up and excluded from each reported sample.

### Public health endpoint

`GET https://api.phaseo.app/v1/health`, 40 sequential requests over a reused client connection:

| Result | Average | p50 | p95 | p99 | Minimum | Maximum |
|---|---:|---:|---:|---:|---:|---:|
| Client-to-edge-to-client | 24.380 ms | 24.084 ms | 30.161 ms | 33.301 ms | 16.676 ms | 33.301 ms |

All 40 requests returned HTTP 200.

### Rejected authentication path

No configured local gateway credential was accepted by the production gateway. A repeated request using the same expired credential was therefore measured only as a rejected-authentication probe; it is not representative of successful gateway dispatch.

`POST https://api.phaseo.app/v1/responses`, 25 sequential requests:

| Result | Average | p50 | p95 | p99 | Minimum | Maximum |
|---|---:|---:|---:|---:|---:|---:|
| Client round trip | 220.717 ms | 176.051 ms | 314.058 ms | 314.613 ms | 124.716 ms | 314.613 ms |
| `Server-Timing: guardAuth` | 22.080 ms | 21.000 ms | 29.000 ms | 35.000 ms | 15.000 ms | 35.000 ms |

All 25 requests returned HTTP 401. Two earlier cold probes with different expired credentials recorded 104 ms and 148 ms for `guardAuth`, consistent with a substantially more expensive uncached lookup path.

## Production Axiom telemetry

The authenticated `gateway_events` dataset was queried with a fixed cutoff of `2026-07-22T07:45:00Z`. The primary window is `2026-07-15T07:45:00Z` to that cutoff. The supporting 30-day window starts at `2026-06-22T07:45:00Z` and may span multiple deployments.

Definitions:

- `internal_latency_ms`: gateway request start to adapter invocation (`adapter_start`). This is the closest persisted measure to upstream dispatch, but it stops before adapter request construction and the actual upstream `fetch()`.
- `before_latency_ms`: authentication, JSON/schema checks, workspace/context loading, policy and capability work.
- `dispatch_core_ms`: derived as `internal_latency_ms - before_latency_ms`. It contains protocol decoding, IR work, provider scoring, sticky/health reads, breaker admission and executor selection. It is not the pure scoring algorithm.
- `before_context_cache_status`: context-cache status only. A context hit does not prove that authentication and every other cache were warm.

### Last 7 days

There were 42 successful requests with complete top-level timing. Traffic was heavily skewed toward provider/integration testing: 38 context misses, four context hits and 12 multi-attempt fallback requests.

| Successful traffic | Requests | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Arrival to adapter start | 42 | 1,440 ms | 1,917 ms | 2,068 ms |
| Before/preflight | 42 | 1,366 ms | 1,727 ms | 1,858 ms |
| Context lookup | 42 | 627 ms | 835 ms | 997 ms |
| Provider latency/TTFT | 42 | 628 ms | 2,845 ms | 5,797 ms |
| Provider-attempt duration | 42 | 830 ms | 4,936 ms | 5,616 ms |

| Context status | Requests | Arrival to adapter p50/p95/p99 | Before p50/p95 | Context p50/p95 | Dispatch core p50/p95/p99 |
|---|---:|---:|---:|---:|---:|
| Hit | 4 | 282 / 437 / 437 ms | 246 / 336 ms | 36 / 78 ms | 57 / 101 / 101 ms |
| Miss | 38 | 1,702 / 1,936 / 2,068 ms | 1,481 / 1,771 ms | 639 / 863 ms | 160 / 252 / 301 ms |

### Last 30 days

There were 156 successful gateway events, of which 147 contained the complete top-level timing fields. The measured set contained 30 context hits, 117 context misses and 35 fallback requests.

| Successful traffic | Requests | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Arrival to adapter start | 147 | 507.326 ms | 1,875.778 ms | 1,990.218 ms |
| Before/preflight | 147 | 459.681 ms | 1,697.553 ms | 1,838.810 ms |
| Context lookup | 147 | 195.894 ms | 768.173 ms | 831.956 ms |
| Provider latency/TTFT | 147 | 783.614 ms | 3,134.603 ms | 5,790.663 ms |

| Context status | Requests | Arrival to adapter p50/p95/p99 | Before p50/p95 | Context p50/p95 | Dispatch core p50/p95/p99 |
|---|---:|---:|---:|---:|---:|
| Hit | 30 | 158 / 1,384 / 1,387 ms | 119 / 1,140 ms | 20 / 219 ms | 50 / 226 / 294 ms |
| Miss | 117 | 582.646 / 1,913.361 / 1,990.218 ms | 527.661 / 1,697.553 ms | 225.295 / 799.388 ms | 54.114 / 216.466 / 243.923 ms |

The fastest observed context-hit request reached adapter invocation in 16 ms. For the 30 context-hit requests, arrival to adapter was 31 ms p10, 50 ms p25 and 158 ms p50. Dispatch core was 4 ms minimum, 8 ms p10, 12 ms p25 and 50 ms p50.

| Context status | Key-version p50/p95/p99 | Cache-read p50/p95/p99 | Complete context p50/p95/p99 |
|---|---:|---:|---:|
| Hit | 5 / 100 / 147 ms | 17 / 119 / 120 ms | 20 / 219 / 265 ms |
| Miss | 31 / 101 / 108 ms | 32 / 133 / 142 ms | 225.295 / 799.388 / 831.956 ms |

## Interpretation

- The current router CPU cost is approximately 1 ms p95 for a 16-provider pool in the local test runtime.
- Production post-preflight dispatch is approximately 50-57 ms p50 and 216-252 ms p95, despite isolated scoring requiring only about 1 ms p95 for 16 providers. Awaited sticky-routing, provider-health or other remote work around the scorer is therefore the likely dominant dispatch cost.
- A context hit still spends approximately 119 ms p50 in the complete before stage over 30 days. Context KV work accounts for 20 ms p50, leaving authentication and policy work as another material target.
- Context misses are catastrophic for the latency goal: 528 ms p50 preflight over 30 days and 1,481 ms p50 in the more recent test-heavy seven-day window.
- The fastest observations show that the current stack can approach the desired range: dispatch core reached 4 ms minimum and 8 ms p10, while arrival to adapter reached 16 ms minimum.
- Production public-edge round trips from London are approximately 24 ms p50 and 30 ms p95. This includes client networking and cannot be interpreted as Worker execution time.
- Rejected warm authentication takes approximately 21 ms p50 inside the production gateway, while observed cold rejected lookups exceeded 100 ms.
- The production sample is dominated by provider and integration testing rather than steady-state customer traffic. Cache-hit and fallback rates must not be treated as product KPIs.
- Percentiles from separate components must not be added together as though they represent an end-to-end percentile.

## Telemetry gap before optimisation

Browser access to Axiom completed the production baseline for arrival-to-adapter timing. However, successful events generally omit `timing_json` and `provider_attempts_json`, so exact arrival-to-first-upstream-`fetch()` timing is not currently recoverable.

Before changing routing behavior, add always-on, low-cardinality successful-request fields for:

1. `upstream_fetch_start_ms`: request start to immediately before the first upstream `fetch()`.
2. `route_providers_ms`: the entire `routeProviders` call, including sticky and health reads.
3. `route_scoring_ms`: CPU-only filtering, scoring and permutation construction.
4. `adapter_request_build_ms`: adapter invocation to immediately before upstream `fetch()`.

These fields must be emitted for all successful requests rather than only full-detail/error samples. No payload or user data is required.

## Canonical Axiom comparison query

Use explicit time bounds so live traffic cannot move the baseline while the query is being inspected:

```apl
['gateway_events']
| where _time >= datetime(2026-07-15T07:45:00Z) and _time < datetime(2026-07-22T07:45:00Z)
| where ['event_type'] == "gateway.request" and ['success'] == true and isnotnull(['internal_latency_ms'])
| extend dispatch_core_ms=['internal_latency_ms'] - ['before_latency_ms']
| summarize requests=count(), p50_dispatch_core=percentile(dispatch_core_ms, 50), p95_dispatch_core=percentile(dispatch_core_ms, 95), p99_dispatch_core=percentile(dispatch_core_ms, 99), p50_internal=percentile(['internal_latency_ms'], 50), p95_internal=percentile(['internal_latency_ms'], 95), p99_internal=percentile(['internal_latency_ms'], 99), p50_before=percentile(['before_latency_ms'], 50), p95_before=percentile(['before_latency_ms'], 95), p99_before=percentile(['before_latency_ms'], 99), p50_context=percentile(['before_context_ms'], 50), p95_context=percentile(['before_context_ms'], 95), p99_context=percentile(['before_context_ms'], 99) by ['before_context_cache_status']
| sort by ['before_context_cache_status'] asc
```

For a future comparison, move both timestamps by the same duration and retain the success filter, field definitions and cache-status grouping unchanged.

## Initial guardrails

These are comparison guardrails, not claims about current production performance:

| Metric | Initial guardrail | Desired target |
|---|---:|---:|
| Router, 16 providers | p95 < 2 ms | p95 < 0.5 ms |
| Router, 64 providers | p95 < 5 ms | p95 < 2 ms |
| Warm authentication, local | p95 < 1 ms | p95 < 0.5 ms |
| Production dispatch core | p50 ~50-57 ms, p95 ~216-252 ms | p50 < 5 ms, p95 < 10 ms |
| Production arrival-to-adapter, context hit | p50 158 ms (30d), 282 ms (7d) | p50 < 10 ms, p95 < 20 ms |
| Exact arrival-to-upstream `fetch()` | not currently instrumented | p50 < 10 ms, p95 < 20 ms |
| Cold authorization lookup | p95 < 150 ms | remove from normal request path |

## Optimisation pass 1 (working tree, 2026-07-22)

The first implementation pass removes advisory remote state from the normal
dispatch critical path while preserving the full provider permutation,
request-local fallback, hard routing gates, breaker persistence and billing.

- Provider health and sticky-routing hints now use isolate-local snapshots with
  KV refresh through `waitUntil`. Cold reads use safe defaults for the current
  request and warm the isolate for the next one.
- Health start/end accounting and breaker evaluation persist in the background,
  so neither a successful dispatch nor moving to the next fallback waits on KV.
- Edge-local in-flight load is no longer a score input. Upstream 429 responses
  continue through the existing fallback list.
- Default routing multiplies inverse-square price utility by one seeded Thompson
  sample of recent provider reliability. The sampled utility is sorted once to
  produce the complete fallback list, avoiding a second routing lottery.
- Rate limits are availability failures: they reduce the provider's reliability
  estimate and can open its breaker; the half-open probe path later explores it
  again automatically.
- API-key version tokens use a 5 second L1 window and version-scoped key rows use
  a 30 second L1 window. A key-version change invalidates the row namespace;
  billing and charge persistence remain synchronous and unchanged.
- Successful Axiom events now include `route_providers_ms`,
  `adapter_request_build_ms`, and `time_to_upstream_request_ms`. The last two
  are populated for executors that expose request-build timing.

Post-change local routing benchmark (500 iterations per pool):

| Candidate providers | Average | p50 | p95 | p99 |
|---:|---:|---:|---:|---:|
| 4 | 0.087 ms | 0.074 ms | 0.144 ms | 0.285 ms |
| 16 | 0.194 ms | 0.162 ms | 0.306 ms | 0.432 ms |
| 64 | 0.704 ms | 0.580 ms | 1.092 ms | 2.268 ms |

The 16-provider p95 fell from 1.037 ms to 0.306 ms in the same benchmark. A
25 ms simulated cold KV health read returns immediately on the optimistic path;
warm health snapshot reads measured 0.012 ms p95. These are local measurements,
not production claims.

After deployment, compare a fixed traffic window using the original baseline
query and add percentiles for the three new top-level timing fields. The first
production acceptance target is context-hit `route_providers_ms` p95 below 5 ms
and `time_to_upstream_request_ms` p50 below 10 ms / p95 below 20 ms. Do not judge
the change from `internal_latency_ms` alone because that legacy field still ends
at adapter entry.

## Optimisation pass 2: unified timing and credential failover

The second pass makes timing response-correlated so a failed request, retry, or
credential attempt cannot become the clock anchor for the provider that
eventually serves the response.

- `latency_ms`: selected provider dispatch to the first complete streamed frame.
- `generation_ms`: selected provider dispatch to the terminal frame (or the
  complete body for synchronous generative endpoints).
- `end_to_end_ms`: gateway receipt to terminal frame/body.
- `provider_duration_ms`: selected provider dispatch to completed executor work;
  this is kept separate from first-frame latency.
- `throughput_tps`: output tokens divided by `generation_ms / 1000`.
- Async video and batch generation use persisted provider-dispatch timestamps and
  calculate generation time only when the job reaches a terminal state.

Text-generation executors request upstream streaming even when the caller asks
for a buffered response. Endpoint switching was removed: failover moves through
ordered credentials and providers, never from one API endpoint to another.

The canonical post-change result is the median of five isolated processes, with
500 measured router iterations per provider pool:

| Candidate providers | Average | p50 | p95 | p99 |
|---:|---:|---:|---:|---:|
| 4 | 0.201 ms | 0.116 ms | 0.286 ms | 1.516 ms |
| 16 | 0.423 ms | 0.304 ms | 0.953 ms | 2.455 ms |
| 64 | 1.959 ms | 1.157 ms | 4.919 ms | 11.916 ms |

The new priority-BYOK -> managed-provider -> fallback-BYOK plan was benchmarked
separately with two BYOK keys per provider. Results are also five-run medians,
with 1,000 measured iterations per pool:

| Providers | Resulting attempts | Average | p50 | p95 | p99 |
|---:|---:|---:|---:|---:|---:|
| 4 | 12 | 0.007 ms | 0.006 ms | 0.012 ms | 0.035 ms |
| 16 | 48 | 0.033 ms | 0.011 ms | 0.028 ms | 0.060 ms |
| 64 | 192 | 0.062 ms | 0.020 ms | 0.063 ms | 0.288 ms |

The 16-provider router p95 is 0.953 ms versus the original 1.037 ms baseline;
the credential plan adds only tens of microseconds. The synthetic 64-provider
stress case is close to the 5 ms guardrail and exceeded it in two of five runs
(5.120 ms and 5.797 ms), so it remains an optimisation target rather than a
stable pass.

Warm health snapshot reads measured 0.012 ms p95. Local routing and health
benchmarks do not include Cloudflare KV, Supabase, or provider networking. The
authoritative before/after dispatch comparison must be run in Axiom after this
version and its database migration are deployed.

## Optimisation pass 3: 100-provider routing ceiling

The normal production path now skips full per-provider score-factor diagnostics
unless routing diagnostics or debug output were explicitly requested. It also
reuses the ranked order for diagnostics instead of sorting a second copy, and
all-pass routing gates reuse their candidate array rather than allocating a new
array at every stage. Provider scoring and ordering are unchanged.

Five isolated processes completed 500 measured iterations for every pool. All
25 pool runs passed the 3 ms p95 guardrail, including all five 100-provider runs:

| Candidate providers | Average | p50 | p95 | p99 |
|---:|---:|---:|---:|---:|
| 4 | 0.119 ms | 0.065 ms | 0.271 ms | 1.080 ms |
| 16 | 0.262 ms | 0.111 ms | 0.392 ms | 1.707 ms |
| 50 | 0.389 ms | 0.254 ms | 1.059 ms | 2.508 ms |
| 64 | 0.474 ms | 0.333 ms | 1.037 ms | 2.682 ms |
| 100 | 0.647 ms | 0.480 ms | 1.220 ms | 2.689 ms |

The table reports the median statistic across the five processes. Individual
100-provider p95 results ranged from 0.905 ms to 2.581 ms. Detailed diagnostics
remain available on explicit diagnostic/debug requests and are intentionally not
part of this production-hot-path benchmark.
