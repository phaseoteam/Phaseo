# Cloudflare real-provider candidate — 2026-07-22

## Environment

- Candidate: `phaseo-gateway-staging`
- Cloudflare Worker version: `19f2f1f3-3a8c-4150-a295-7fd5c59449d0`
- Production Supabase and provider credentials
- Separate staging KV and R2 bindings
- Discovery, reconciliation, email, pricing-monitor, and invoicing schedules disabled
- Model: `poolside/laguna-s-2.1` routed directly to Poolside
- Requests: authenticated, streamed, normal billing/audit mode (not testing mode)

## Real gateway run

Three warmups followed by 20 sequential measured requests from London produced 20/20 HTTP 200 responses.

| Metric | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Internal request-entry to upstream dispatch | 4 ms | 11 ms | 118 ms |
| Provider upstream headers | 222 ms | 359 ms | 1,287 ms |
| Client first complete SSE frame | 265.4 ms | 534.2 ms | 1,315.6 ms |
| Client stream completion | 286.0 ms | 543.5 ms | 1,347.1 ms |

Provider scoring/ranking and fallback-plan construction were below the one-millisecond `Server-Timing` resolution during the deployed run.

## Independent benchmark harness

`rbadillap/ai-gateways-benchmark` was run with ten cold and ten warm requests, `max_tokens=8`, from the same London workstation.

| DNS | TCP | TLS | TTFB | TTFT | Cold end-to-end TTFT | Warm TTFB | Warm TTFT |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.6 ms | 12.7 ms | 19.0 ms | 564.8 ms | 564.9 ms | 602.2 ms | 264.7 ms | 264.8 ms |

Receipt: Cloudflare Ray `a1f53abf3e57579e-LHR`.

These numbers include Poolside inference. They must not be presented as gateway-only overhead or compared with another gateway using a different model/provider path. The server-side internal-dispatch metric is the gateway-overhead measurement.

## Persistence verification

The same successful request is persisted in both the compatibility billing table and `v2_request_facts`.

- `latency_ms` is dispatch to first streamed frame.
- `generation_ms` is dispatch to final streamed frame.
- `internal_dispatch_ms` is request entry to the selected upstream `fetch` call.
- `gateway_total_ms` equals internal dispatch plus generation time.
- Throughput is output tokens divided by generation seconds.
- The v2 fact links the canonical requested/routed model and exact provider route.
- Poolside free requests persisted with `cost_nanos = 0`; persistence was not bypassed.
- No prompt or completion payload is stored unless the workspace explicitly enables I/O logging.

## CPU microbenchmarks

| Work | Scale | p95 |
| --- | ---: | ---: |
| Provider scoring and ordering | 50 providers | 1.566 ms |
| Provider scoring and ordering | 100 providers | 1.488 ms |
| Credential fallback plan | 64 providers / 192 attempts | 0.050 ms |
| Warm provider-health read | 1 provider | 0.016 ms |

## Production assessment

The routing algorithm, complete credential fallback list, canonical v2-to-compatibility model resolution, real streaming path, billing persistence, and timing semantics are functioning. Promotion should use a small Cloudflare version split with error-rate and `internal_dispatch_ms` monitoring. The 3 ms p95 goal is not yet met end to end: warmed p95 was 11 ms, with the residual concentrated in authentication, request-context, and workspace-policy cache I/O rather than ranking.

## Policy/context overlap optimization

Workspace-policy loading was moved alongside request-context loading so the two
independent cache/source reads overlap while enforcement remains fail closed.

An isolated synthetic run after the change completed 200/200 requests at 188.174
requests/second. Internal dispatch was p50 4 ms and p95 10 ms; workspace-policy
p95 was 0 ms, request-context p95 was 9 ms, and provider scoring remained below
the one-millisecond timing resolution.

A separate 20-request real-provider cohort using `openai/gpt-5.6-luna`
completed 20/20 requests:

| Metric | p50 | p95 |
| --- | ---: | ---: |
| Internal request-entry to upstream dispatch | 5 ms | 15 ms |
| OpenAI upstream response headers | 578 ms | 872 ms |
| Client first complete SSE frame | 638.3 ms | 942.3 ms |
| Client stream completion | 705.4 ms | 979.7 ms |

The remaining internal floor is the request-context KV read used to preserve
fresh authentication, credit, privacy, provider-policy, and key-limit state.
Adding a longer-lived isolate-local context cache could lower the reported
number, but would lengthen propagation of those changes and is not enabled.
