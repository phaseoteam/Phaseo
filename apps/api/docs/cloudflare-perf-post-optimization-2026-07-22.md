# Cloudflare gateway performance after routing optimisations — 2026-07-22

## Deployment

- Isolated gateway Worker: `https://phaseo-gateway-perf.danielbutler500.workers.dev`
- Synthetic upstream Worker: `https://phaseo-perf-upstream.danielbutler500.workers.dev`
- Model: `openai/gpt-5.4-nano`
- Edge receipt: Cloudflare LHR
- Production Supabase reads through the allowlisted `Performance Testing` workspace
- Dedicated performance KV and R2 bindings
- Internal testing mode enabled; billing and production gateway-request persistence disabled

The final run followed a 90-second secret-propagation window and completed without
authentication, gateway, or upstream failures. Earlier diagnostic runs are excluded.

## Phaseo streaming harness

Configuration: 50 warmups, 500 measured requests, concurrency 20, immediate streamed
synthetic upstream.

| Metric | p50 | p95 | p99 |
| --- | ---: | ---: | ---: |
| Receive to first upstream `fetch()` | 4 ms | 8 ms | 37 ms |
| Context lookup | 4 ms | 7 ms | 13 ms |
| Client response headers | 39.453 ms | 67.854 ms | 349.148 ms |
| Client first complete SSE frame | 39.524 ms | 67.964 ms | 349.217 ms |
| Client stream complete | 42.972 ms | 87.977 ms | 363.865 ms |

- Successes: 500/500
- Throughput: 302.854 requests/second
- Provider routing and adapter request construction were below Axiom's integer-millisecond
  resolution in this cohort. Local microbenchmarks remain the higher-resolution source for
  those CPU-only stages.

The receive-to-fetch result uses `time_to_upstream_request_ms`, anchored when the pipeline
`Timer` is constructed and stopped immediately before the first provider `fetch()`. It is
not the older arrival-to-adapter proxy.

## `rbadillap/ai-gateways-benchmark`

Source: <https://github.com/rbadillap/ai-gateways-benchmark>

Configuration: 20 cold connections and 20 warm persistent connections, streaming enabled,
16 maximum output tokens, same Phaseo preview and synthetic upstream.

| Gateway | DNS | TCP | TLS | TTFB | TTFT | Cold e2e TTFT | Warm TTFB | Warm TTFT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Phaseo preview | 0.6 ms | 11.8 ms | 20.7 ms | 118.6 ms | 118.7 ms | 156.8 ms | 48.3 ms | 48.4 ms |

These are medians from the local London vantage point. The benchmark's cold result includes
DNS, TCP, a fresh full TLS handshake, Cloudflare ingress, gateway work, public HTTPS egress to
the synthetic upstream, and the first streamed content token. It is not a gateway-internal
latency measurement.

## Safety verification

- Final load cohort: 500/500 successful
- External benchmark: 20/20 cold and 20/20 warm runs successful
- Temporary benchmark keys: all deleted
- Production `gateway_requests` rows for temporary keys: 0
- Production KV was not used
- No paid model provider was called

## Compatibility and timing fixes discovered by deployment

The preview initially failed closed because production had not yet applied two optional schema
columns used by the working tree. The context loader now retries only verified missing-column
errors:

- Missing `data_policy_variant`: retry the legacy provider select and classify every provider
  as `standard`; ZDR cannot be granted implicitly.
- Missing `cache_aware_routing_enabled`: retry without that non-policy setting while continuing
  to fetch every privacy, logging, billing, and ZDR-related workspace field explicitly.

The preview also exposed that `startedAtMs` was previously assigned when request metadata was
constructed, after authentication and context loading. The request epoch is now captured at
pipeline `Timer` construction and propagated unchanged, making `time_to_upstream_request_ms`
an actual gateway-receipt-to-provider-fetch measurement.
