# v2 data model foundation

The `20260722_v2_*` migrations introduce an additive database namespace for
the model catalogue, billing, request facts, and analytics projections. The
existing `data_*`, `gateway_*`, and billing tables remain live until the
backfill and consumer cutover are verified.

## Identity and routing

- `v2_models.model_slug` is the canonical model identity used by URLs,
  aliases, requests, rollups, and public rankings.
- Provider offers ending in `:free` materialise as first-class API model
  identities, displayed as `{base name} (Free)`. The row records
  `variant_kind = 'free'`. A free model may stand alone; `base_model_slug`
  only links a genuine standard sibling when one exists. Provider routes,
  request facts, usage rollups, performance, and health all retain the free
  identity instead of merging it back into the base model.
- Free models may be standalone model JSON records. When a genuine standard
  sibling exists, they may instead use its `variants` array. Provider-model
  JSON points to the exact variant through `canonical_model_id`. A
  provider-specific free API ID that differs from the canonical spelling is
  stored as an alias to the canonical `:free` model. Validation rejects free
  routes without an authored free model; database automation never manufactures one.
- `v2_model_aliases` resolves client input to a canonical model slug.
- `v2_labs` owns model metadata. `v2_providers` represents a provider endpoint
  (including `external` catalogue-only providers) and has global status and
  routing switches.
- `v2_model_provider_routes` is the provider/model combination anchor. It has
  its own status and routing switch; pricing, request facts, and rollups point
  to `provider_model_id`.
- `v2_provider_regions` normalises execution and residency regions. A provider
  can expose a global endpoint and/or explicit regional offers such as
  `openai-eu`, `google-vertex-eu`, or AWS regions.
- `v2_service_tiers` is the stable tier dictionary. `v2_route_variants` joins
  a route to a region and tier, so the same provider/model can expose global,
  EU, batch, priority, or other offers without adding columns. Every pricing
  SKU carries its tier and resolves to its global route variant by default.
- `v2_route_capabilities` keeps endpoint/capability status and parameter facts
  queryable for routing and display.
- A route is eligible only when the model, lab, provider, and route are all
  enabled and within their effective windows.

## Pricing and billing

- `v2_pricing_skus` attaches a versioned SKU to a provider/model route.
- `v2_pricing_sku_meters` stores flexible meter definitions, display labels,
  units, and prices. Adding a character, image, audio, video, embedding, or
  reranking meter does not require a new column.
- `v2_credit_ledger` is append-only and contains balance-affecting entries.
- `v2_credit_reservations` contains temporary holds for asynchronous work;
  capture and release operations write corresponding ledger entries.

## Observability and analytics

- `gateway_requests` remains the authoritative operational record that a
  gateway request occurred. Billing, refunds, lifecycle finalization, exact
  logs, and request identity always start from that table.
- `v2_request_facts` is a one-to-one observability extension of an
  authoritative `gateway_requests` row. It stores model resolution, route,
  timing, status, user-agent/SDK metadata, and the tool-call stop-reason
  count. It never stores prompt, completion, provider body, or tool I/O data.
- `v2_request_attempts` records failover attempts. `v2_request_artifacts`
  stores R2 object keys, hashes, sizes, and retention metadata only.
- `v2_request_usage` stores meter facts and `v2_request_pricing_lines` stores
  the immutable SKU/rate snapshot used for billing.
- `v2_private_usage_daily` is workspace-scoped. `v2_public_usage_daily` is
  the durable public projection, with `v2_public_usage_hourly` for recent
  performance windows. Meter quantities remain in child tables.
- Cache hit rate is calculated as `cached_input_tokens / input_tokens`.
  Percentages are not persisted; rollups retain numerators and denominators.
- `v2_public_provider_health_daily` separates logical request counts from
  provider-attempt counts. A failed provider attempt remains visible after a
  later failover succeeds; the health RPC exposes attempt uptime, request
  success, failure percentage, fallback attempts, and daily buckets. New
  attempts refresh the affected daily provider row through a database trigger.
  Health is an observation and routing signal, not a permanent provider
  blacklist: degraded providers remain eligible for controlled exploration
  unless an explicit status/routing switch or circuit breaker blocks them.

## Benchmarks and subscriptions

- `v2_benchmarks` and `v2_benchmark_results` are the slug-keyed benchmark
  catalogue and result projections, retaining score text/numeric values,
  source links, ranks, variants, and self-reported status.
- `v2_subscription_plans`, `v2_subscription_plan_models`, and
  `v2_subscription_plan_features` contain public plan inclusions keyed by
  model slug, with frequency, limits, feature metadata, and source JSON.

## SQL-owned read paths

- `get_public_models_page_rows()` is the public catalogue contract and now
  delegates to the v2 projection, including catalogue-only models and all
  available service tiers.
- `get_v2_public_models_page_rows(region, service_tier)` owns the expensive
  model/provider/variant/capability/pricing joins. The Worker only applies
  pagination, search, and response caching.
- `get_v2_model_overview()` and `get_v2_routing_candidates()` provide the
  detail and routing contracts. `get_v2_provider_region_map()` is used by
  compatibility paths instead of reading provider metadata directly.
- Model-page sections now have dedicated contracts for identity, aliases,
  canonical resolution, availability, pricing, gateway metadata, performance,
  daily usage, and app distribution (`get_v2_model_identity()`,
  `get_v2_model_aliases()`, `get_v2_model_resolution()`,
  `get_v2_model_availability()`, `get_v2_model_pricing()`,
  `get_v2_model_performance_overview()`, `get_v2_model_usage_daily()`,
  `get_v2_model_apps()`, `get_v2_model_benchmarks()`,
  `get_v2_model_subscription_plans()`, and
  `get_v2_model_provider_health()`). The Next page starts its independent overview,
  benchmark, subscription, availability, and performance requests together;
  streamed sections retain separate API routes, cache policies, and failure
  boundaries.
- The admin editor and approved database automations write the v2 catalogue
  directly. Public JSON snapshots are exported from v2 for compatibility,
  documentation, and SDK generation; they are not an authoring or import feed.

Release timelines and pricing history still retain compatibility fallbacks.
Benchmarks, subscriptions, and provider health now have v2 RPC paths and
backfilled data; the fallback remains for deployments where those functions
have not yet been rolled out.

## V1 retirement boundary

`gateway_requests` is not a V1 retirement candidate. The V2 request tables
extend it and may be retained or renamed independently of the static catalogue
cutover.

Runtime catalogue, pricing, routing, public analytics, private usage trends,
provider-health, benchmark, and subscription reads now use V2 tables or
explicit `v2_*` SQL projections. Exact request logs continue to use
`gateway_requests` and can be enriched through
`get_gateway_request_observability()`. The established rollup refresh RPC names
are adapters over the V2 analytics outbox.

The old tables cannot be dropped yet. The remaining dependencies are writes or
entities without a V2 equivalent:

- gateway audit, realtime, and async-finalization lifecycle code owns the
  authoritative `gateway_requests` record while also writing its V2
  observability extension;
- the catalogue administration mutation adapter remains legacy, while the
  internal database editor is the intended authoring surface;
- model links/details/families, organisation links, and page notices do not yet
  have V2 replacements;

Those dependencies must be migrated or deliberately removed before physical V1
table deletion. They are not used by current website or gateway read paths.
