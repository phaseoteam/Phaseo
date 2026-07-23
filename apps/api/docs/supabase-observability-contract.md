# Supabase gateway observability contract

Supabase is the durable, unsampled analytical and billing projection for every
production gateway request. Axiom remains the high-cardinality operational
wide-event destination. Raw request, response, provider, and tool payloads are
never part of this contract.

## Atomic write path

Each finalized request calls `ingest_v2_gateway_request_with_routing` once. The
wrapper calls the core ingestion function in the same transaction, takes an
advisory lock keyed by workspace/request, and atomically replaces:

- one `v2_request_facts` row;
- all `v2_request_attempts` rows;
- all `v2_request_usage` meter rows;
- all `v2_request_pricing_lines` rows;
- all `v2_request_routing_decisions` rows;
- one pending `v2_analytics_outbox` marker.

The `(workspace_id, request_id)` identity makes retries idempotent. Child rows
are replaced inside the same transaction, so a request cannot expose a new fact
with stale attempts, meters, or pricing lines.

## Metric semantics

| Metric | Stored value |
| --- | --- |
| Latency / TTFT | Selected upstream request send boundary to first streamed frame/response bytes |
| Generation time | Selected upstream request send boundary to final frame/completed response |
| Internal dispatch | Gateway request entry to selected upstream request send boundary |
| Gateway end-to-end | Gateway request entry to final frame/completed response |
| Throughput | Output tokens divided by upstream generation seconds |
| Cache hit rate | `cached_input_tokens / input_tokens` |
| Tool-call rate | Requests with `tool_call_count > 0 / requests` |
| Tool-call success | Successful requests with tool calls / requests with tool calls |
| Structured-output success | JSON-parsable structured responses / structured-output requests |
| Provider health | Successful/failed attempt rows, independent of final logical-request success |

Structured-output success currently verifies observable JSON parsing. It does
not yet run the response against the supplied JSON Schema; the safe metadata
records the basis as `json_parse` or `unobserved` so the UI does not imply
stronger validation than occurred.

## Request facts

The request fact stores the dimensions required for private logs, filtering,
performance queries, and long-term rankings:

- workspace, app, API key, session, end user, and auth method;
- exact requested model input, canonical requested/routed model, and concrete
  provider/model route;
- endpoint, provider response ID, stream/BYOK state, status and safe error code;
- Cloudflare execution colo;
- latency, generation, internal dispatch, gateway end-to-end and throughput;
- tool-call and structured-output counters;
- total charged nanos and currency.

## Upstream attempts

Every routing/fallback attempt is a separate row with:

- order;
- provider/model route when resolvable;
- status, success, failure class and safe error code;
- duration;
- retryability, probe state and credential phase (`priority_byok`, platform, or
  fallback BYOK) in safe metadata.

No API key values, decrypted credentials or provider bodies are stored.

## Routing decisions

Every provider considered by the scorer is stored in request order with:

- provider/model route, rank, final score and whether it was selected/attempted;
- provider, model and capability routing statuses;
- breaker state and breaker expiry;
- the bounded scalar factors used to construct the score: price, sampled
  reliability, observed success, latency/tail latency, throughput, token
  affinity, base weight, rollout/routing multipliers, cache boost and request
  preference multipliers;
- providers rejected before scoring, with the exact exclusion stage and reason
  (for example `provider.ignore`, status, residency, pricing cap or capability).

This is a normalized child table rather than request JSON so the request log UI
can fetch the decision list by `(request_event_id, decision_order)` and routing
quality can later be analyzed by route or exclusion reason. It stores no prompt,
completion, secret, URL, provider body or free-form upstream error message.

## Usage meters

Only positive quantities are written. Meter rows currently cover:

- input, output and reasoning tokens;
- text/image/audio/video token breakdowns;
- cached input and cache-write tokens, including TTL-specific writes;
- input/output image, audio and video counts;
- audio seconds, video pixel-seconds and image megapixels;
- input/output characters.

This is deliberately row-based so future provider meters require data changes,
not schema columns. Meter keys align with SKU meter keys wherever possible.

## Pricing snapshots

Every computed pricing line preserves:

- meter key and quantity;
- unit price in nanos;
- exact charged nanos;
- resolved SKU/SKU-meter IDs when the active v2 SKU can be matched.

Historical charges therefore remain reproducible after catalogue prices change.

## Rollup processing

`process_v2_analytics_outbox` runs from the Cloudflare scheduled Worker on the
five-minute core tick. It claims a bounded batch with `FOR UPDATE SKIP LOCKED`
and rebuilds only affected grains:

- private workspace/app/model/provider/colo daily;
- public app/model/provider/colo daily;
- recent public app/model/provider/colo hourly.

Recalculation rather than blind increments keeps request retries and async
finalization updates idempotent. Rollups retain additive numerators and
denominators rather than percentages, including cache tokens, structured-output
attempts/successes, tool-call requests/successes, upstream attempts/failures,
and timing sums/counts.

## Privacy boundary

Supabase must never receive:

- prompts or completions;
- tool names, arguments, or results;
- upstream request/response bodies;
- authorization headers or API keys;
- arbitrary request headers;
- full error bodies.

When a workspace explicitly enables I/O logging, content is written to R2 under
the separate retention policy. Supabase stores only the artifact reference,
hash, size, content type, redaction state and retention metadata.
