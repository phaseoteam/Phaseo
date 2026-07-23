-- Provider performance series must only contain real catalogue providers.
-- Recover older facts from safe provider metadata where the route is
-- unambiguous, and keep genuinely provider-less failures in overall metrics
-- without presenting them as a synthetic "unknown" provider.

with recoverable as (
  select
    fact.request_event_id,
    candidate.provider_model_id
  from public.v2_request_facts fact
  cross join lateral (
    select route.provider_model_id
    from public.v2_model_provider_routes route
    where route.provider_slug = nullif(lower(trim(fact.safe_metadata->>'provider')), '')
      and route.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
      and (
        route.provider_model_id =
          nullif(lower(trim(fact.safe_metadata->>'provider')), '') || ':' ||
          nullif(trim(fact.safe_metadata->>'routed_model'), '')
        or route.provider_model_slug = nullif(trim(fact.safe_metadata->>'routed_model'), '')
        or 1 = (
          select count(*)
          from public.v2_model_provider_routes sibling
          where sibling.provider_slug = route.provider_slug
            and sibling.model_slug = route.model_slug
        )
      )
    order by
      case
        when route.provider_model_id =
          nullif(lower(trim(fact.safe_metadata->>'provider')), '') || ':' ||
          nullif(trim(fact.safe_metadata->>'routed_model'), '') then 0
        when route.provider_model_slug = nullif(trim(fact.safe_metadata->>'routed_model'), '') then 1
        else 2
      end,
      route.provider_model_id
    limit 1
  ) candidate
  where fact.provider_model_id is null
)
update public.v2_request_facts fact
set provider_model_id = recoverable.provider_model_id
from recoverable
where fact.request_event_id = recoverable.request_event_id;

create or replace function public.get_v2_model_performance_overview(
  p_model_slug text,
  p_cloudflare_colo text default null,
  p_percentile numeric default 0.5
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select lower(trim(p_model_slug)) as model_slug,
      nullif(upper(trim(p_cloudflare_colo)), '') as cloudflare_colo,
      greatest(0.01, least(0.99, coalesce(p_percentile, 0.5)))::double precision as percentile,
      now() as now_ts
  ),
  base as (
    select date_trunc('hour', fact.occurred_at) as bucket_start,
      fact.occurred_at::date as usage_day,
      coalesce(route.provider_slug, metadata_provider.provider_slug) as provider_id,
      fact.success, fact.latency_ms, fact.generation_ms, fact.throughput
    from public.v2_request_facts fact
    left join public.v2_model_provider_routes route
      on route.provider_model_id = fact.provider_model_id
    left join public.v2_providers metadata_provider
      on metadata_provider.provider_slug = nullif(lower(trim(fact.safe_metadata->>'provider')), '')
    cross join params
    where coalesce(fact.routed_model_slug, fact.requested_model_slug) = params.model_slug
      and fact.occurred_at >= params.now_ts - interval '7 days'
      and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
  ),
  hourly as (
    select bucket_start,
      count(*)::bigint as requests,
      count(*) filter (where success is true)::bigint as successful_requests,
      percentile_cont((select percentile from params)) within group (order by latency_ms) filter (where success is true and latency_ms is not null)::numeric as percentile_latency_ms,
      avg(generation_ms) filter (where success is true and generation_ms is not null)::numeric as avg_generation_ms,
      percentile_cont((select percentile from params)) within group (order by throughput) filter (where success is true and throughput is not null)::numeric as percentile_throughput
    from base
    group by bucket_start
  ),
  recent as (
    select * from base where bucket_start >= (select now_ts from params) - interval '24 hours'
  ),
  summary as (
    select count(*)::bigint as requests, count(*) filter (where success is true)::bigint as successful_requests,
      percentile_cont((select percentile from params)) within group (order by latency_ms) filter (where success is true and latency_ms is not null)::numeric as percentile_latency_ms,
      avg(generation_ms) filter (where success is true and generation_ms is not null)::numeric as avg_generation_ms,
      percentile_cont((select percentile from params)) within group (order by throughput) filter (where success is true and throughput is not null)::numeric as percentile_throughput
    from recent
  ),
  previous as (
    select count(*)::bigint as requests, count(*) filter (where success is true)::bigint as successful_requests,
      percentile_cont((select percentile from params)) within group (order by latency_ms) filter (where success is true and latency_ms is not null)::numeric as percentile_latency_ms,
      avg(generation_ms) filter (where success is true and generation_ms is not null)::numeric as avg_generation_ms,
      percentile_cont((select percentile from params)) within group (order by throughput) filter (where success is true and throughput is not null)::numeric as percentile_throughput
    from base
    where bucket_start >= (select now_ts from params) - interval '48 hours'
      and bucket_start < (select now_ts from params) - interval '24 hours'
  ),
  provider_rows as (
    select provider_id, count(*)::bigint as requests, count(*) filter (where success is true)::bigint as successful_requests,
      percentile_cont((select percentile from params)) within group (order by latency_ms) filter (where success is true and latency_ms is not null)::numeric as percentile_latency_ms,
      avg(generation_ms) filter (where success is true and generation_ms is not null)::numeric as avg_generation_ms,
      percentile_cont((select percentile from params)) within group (order by throughput) filter (where success is true and throughput is not null)::numeric as percentile_throughput
    from recent
    where provider_id is not null
    group by provider_id
  ),
  provider_daily as (
    select usage_day, provider_id, count(*)::bigint as requests,
      percentile_cont((select percentile from params)) within group (order by latency_ms) filter (where success is true and latency_ms is not null)::numeric as percentile_latency_ms,
      avg(generation_ms) filter (where success is true and generation_ms is not null)::numeric as avg_generation_ms,
      percentile_cont((select percentile from params)) within group (order by throughput) filter (where success is true and throughput is not null)::numeric as percentile_throughput
    from base
    where provider_id is not null
    group by usage_day, provider_id
  ),
  hourly_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket', bucket_start, 'requests', requests,
      'success_pct', case when requests > 0 then successful_requests * 100.0 / requests else null end,
      'avg_latency_ms', percentile_latency_ms, 'avg_generation_ms', avg_generation_ms, 'avg_throughput', percentile_throughput
    ) order by bucket_start) filter (where bucket_start >= (select now_ts from params) - interval '24 hours'), '[]'::jsonb) as value
    from hourly
  ),
  provider_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'provider', p.provider_id, 'provider_name', v.name, 'requests', p.requests,
      'uptime_pct', case when p.requests > 0 then p.successful_requests * 100.0 / p.requests else null end,
      'avg_latency_ms', p.percentile_latency_ms, 'avg_generation_ms', p.avg_generation_ms, 'avg_throughput', p.percentile_throughput,
      'uptime_buckets', '[]'::jsonb
    ) order by p.requests desc, p.provider_id), '[]'::jsonb) as value
    from provider_rows p
    join public.v2_providers v on v.provider_slug = p.provider_id
  ),
  provider_daily_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'day', d.usage_day, 'provider', d.provider_id, 'provider_name', v.name,
      'requests', d.requests, 'avg_latency_ms', d.percentile_latency_ms, 'avg_generation_ms', d.avg_generation_ms,
      'avg_throughput', d.percentile_throughput
    ) order by d.usage_day, d.provider_id), '[]'::jsonb) as value
    from provider_daily d
    join public.v2_providers v on v.provider_slug = d.provider_id
  )
  select jsonb_build_object(
    'percentile', (select percentile from params) * 100,
    'last_24h', jsonb_build_object(
      'total_requests', coalesce(summary.requests, 0), 'successful_requests', coalesce(summary.successful_requests, 0),
      'avg_latency_ms', summary.percentile_latency_ms, 'avg_generation_ms', summary.avg_generation_ms,
      'avg_throughput', summary.percentile_throughput,
      'uptime_pct', case when summary.requests > 0 then summary.successful_requests * 100.0 / summary.requests else null end
    ),
    'prev_24h', jsonb_build_object(
      'total_requests', coalesce(previous.requests, 0), 'successful_requests', coalesce(previous.successful_requests, 0),
      'avg_latency_ms', previous.percentile_latency_ms, 'avg_generation_ms', previous.avg_generation_ms,
      'avg_throughput', previous.percentile_throughput,
      'uptime_pct', case when previous.requests > 0 then previous.successful_requests * 100.0 / previous.requests else null end
    ),
    'hourly_24h', (select value from hourly_json),
    'provider_uptime_24h', (select value from provider_json),
    'provider_daily_7d', (select value from provider_daily_json),
    'time_of_day_5d', '[]'::jsonb,
    'cumulative_tokens', null,
    'cloudflare_colo', (select cloudflare_colo from params)
  )
  from summary cross join previous;
$$;

grant execute on function public.get_v2_model_performance_overview(text, text, numeric)
  to anon, authenticated, service_role;

comment on function public.get_v2_model_performance_overview(text, text, numeric) is
  'Returns model performance percentiles; provider series include only real v2 catalogue providers.';
