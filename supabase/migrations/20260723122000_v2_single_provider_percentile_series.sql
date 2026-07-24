-- A single-provider model is more useful when its distribution is visible
-- directly. Calculate all supported percentiles in one scan so the web client
-- does not need to issue five performance requests.

create or replace function public.get_v2_model_provider_percentile_series(
  p_model_slug text,
  p_cloudflare_colo text default null
)
returns table (
  usage_day date,
  provider_id text,
  provider_name text,
  requests bigint,
  latency_p50 numeric,
  latency_p75 numeric,
  latency_p90 numeric,
  latency_p95 numeric,
  latency_p99 numeric,
  generation_p50 numeric,
  generation_p75 numeric,
  generation_p90 numeric,
  generation_p95 numeric,
  generation_p99 numeric,
  throughput_p50 numeric,
  throughput_p75 numeric,
  throughput_p90 numeric,
  throughput_p95 numeric,
  throughput_p99 numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    fact.occurred_at::date as usage_day,
    provider.provider_slug as provider_id,
    provider.name as provider_name,
    count(*)::bigint as requests,
    percentile_cont(0.50) within group (order by fact.latency_ms)
      filter (where fact.success is true and fact.latency_ms is not null)::numeric as latency_p50,
    percentile_cont(0.75) within group (order by fact.latency_ms)
      filter (where fact.success is true and fact.latency_ms is not null)::numeric as latency_p75,
    percentile_cont(0.90) within group (order by fact.latency_ms)
      filter (where fact.success is true and fact.latency_ms is not null)::numeric as latency_p90,
    percentile_cont(0.95) within group (order by fact.latency_ms)
      filter (where fact.success is true and fact.latency_ms is not null)::numeric as latency_p95,
    percentile_cont(0.99) within group (order by fact.latency_ms)
      filter (where fact.success is true and fact.latency_ms is not null)::numeric as latency_p99,
    percentile_cont(0.50) within group (order by fact.generation_ms)
      filter (where fact.success is true and fact.generation_ms is not null)::numeric as generation_p50,
    percentile_cont(0.75) within group (order by fact.generation_ms)
      filter (where fact.success is true and fact.generation_ms is not null)::numeric as generation_p75,
    percentile_cont(0.90) within group (order by fact.generation_ms)
      filter (where fact.success is true and fact.generation_ms is not null)::numeric as generation_p90,
    percentile_cont(0.95) within group (order by fact.generation_ms)
      filter (where fact.success is true and fact.generation_ms is not null)::numeric as generation_p95,
    percentile_cont(0.99) within group (order by fact.generation_ms)
      filter (where fact.success is true and fact.generation_ms is not null)::numeric as generation_p99,
    percentile_cont(0.50) within group (order by fact.throughput)
      filter (where fact.success is true and fact.throughput is not null)::numeric as throughput_p50,
    percentile_cont(0.75) within group (order by fact.throughput)
      filter (where fact.success is true and fact.throughput is not null)::numeric as throughput_p75,
    percentile_cont(0.90) within group (order by fact.throughput)
      filter (where fact.success is true and fact.throughput is not null)::numeric as throughput_p90,
    percentile_cont(0.95) within group (order by fact.throughput)
      filter (where fact.success is true and fact.throughput is not null)::numeric as throughput_p95,
    percentile_cont(0.99) within group (order by fact.throughput)
      filter (where fact.success is true and fact.throughput is not null)::numeric as throughput_p99
  from public.v2_request_facts fact
  join public.v2_model_provider_routes route
    on route.provider_model_id = fact.provider_model_id
  join public.v2_providers provider
    on provider.provider_slug = route.provider_slug
  where coalesce(fact.routed_model_slug, fact.requested_model_slug) = lower(trim(p_model_slug))
    and fact.occurred_at >= now() - interval '7 days'
    and (
      nullif(upper(trim(p_cloudflare_colo)), '') is null
      or upper(trim(fact.cloudflare_colo)) = upper(trim(p_cloudflare_colo))
    )
  group by fact.occurred_at::date, provider.provider_slug, provider.name
  order by usage_day, provider.provider_slug;
$$;

grant execute on function public.get_v2_model_provider_percentile_series(text, text)
  to anon, authenticated, service_role;

comment on function public.get_v2_model_provider_percentile_series(text, text) is
  'Returns P50/P75/P90/P95/P99 provider performance series for single-provider model charts.';
