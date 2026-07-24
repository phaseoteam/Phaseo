# Cloudflare performance harness baseline — 2026-07-22

## Deployment

- Gateway: `https://phaseo-gateway-perf.danielbutler500.workers.dev`
- Synthetic upstream: `https://phaseo-perf-upstream.danielbutler500.workers.dev`
- Production Supabase workspace: `Performance Testing` (`6108396e-0e12-425d-91ff-a02d39a346e0`)
- Dedicated KV: `GATEWAY_CACHE_PERF` (`44e6e455fada499c8681d0ff4d2525dd`)
- Dedicated R2: `phaseo-gateway-perf-io-logs`

Both Workers are separate from production traffic. The gateway requires the allowlisted workspace API key and the internal test token. Testing mode calculates pricing and emits Axiom events but skips credit charges and production gateway-request persistence. The deployment only permits synchronous text-generation endpoints.

## Fast single-provider cohort

Command parameters: 25 warmups, 200 measured requests, concurrency 10, `openai/gpt-5.4-nano`, synthetic `fast` upstream.

| Metric | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Client response headers | 37.774 ms | 75.615 ms | 366.434 ms |
| Client first SSE frame | 37.903 ms | 75.698 ms | 366.557 ms |
| Client stream complete | 41.133 ms | 92.078 ms | 377.627 ms |
| Gateway internal latency | 4 ms | 8 ms | 37 ms |
| Gateway context lookup | 4 ms | 8 ms | 12 ms |
| Upstream response headers | 6 ms | 10 ms | 12 ms |

- Success: 200/200
- Throughput: 142.372 requests/second
- Routing/ranking spans: below the one-millisecond resolution exposed in `Server-Timing`

## Fallback cohort

Command parameters: 2 warmups, 20 measured requests, concurrency 1, `meta/llama-3.3-70b`.

- DeepInfra returned synthetic 503.
- Groq returned synthetic 429.
- Together returned a controlled streamed success.
- Success: 20/20; multiple provider attempts were visible in `Server-Timing`.
- Gateway internal latency: p50 7 ms, p95 14 ms.
- Gateway execution time: p50 13 ms, p95 1,041 ms.

The approximately one-second fallback tail is caused by current retry delays before provider advancement. The harness is correctly exposing this as a separate optimization target; it is not routing CPU time.

## Billing and persistence safety check

Snapshots were taken immediately before and after the 200-request measured cohort:

- Wallet balance unchanged: yes.
- Reserved balance unchanged: yes.
- Production `gateway_requests` rows added: 0.

This verifies that the production database can safely provide the real authentication, context, pricing, and provider mappings while synthetic operational state remains isolated.
