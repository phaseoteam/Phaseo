-- Preserve the service-tier health breakdown while restoring the token and
-- outcome aggregates exposed by the provider health contract.
create or replace function public.get_v2_model_provider_tier_health_metrics(
  p_model_slug text,
  p_window_days integer default 3,
  p_percentile numeric default 0.5
)
returns table (
  provider_id text,
  service_tier text,
  provider_name text,
  requests bigint,
  requests_30m bigint,
  success_requests bigint,
  failed_requests bigint,
  neutral_requests bigint,
  rate_limited_requests bigint,
  health_requests bigint,
  health_success_requests bigint,
  uptime_pct numeric,
  request_success_pct numeric,
  avg_latency_ms_30m numeric,
  avg_throughput_30m numeric,
  percentile_latency_ms_30m numeric,
  percentile_throughput_30m numeric,
  avg_latency_ms numeric,
  p50_latency_ms numeric,
  p95_latency_ms numeric,
  percentile_latency_ms numeric,
  avg_generation_ms numeric,
  avg_throughput numeric,
  percentile_throughput numeric,
  total_tokens bigint,
  input_tokens_1h bigint,
  output_tokens_1h bigint,
  cached_read_tokens_1h bigint,
  input_tokens bigint,
  output_tokens bigint,
  finish_reason_counts jsonb,
  error_code_counts jsonb,
  buckets jsonb,
  last_request_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      model.model_slug,
      greatest(0.01, least(0.99, coalesce(p_percentile, 0.5)))::double precision as percentile,
      greatest(1, least(coalesce(p_window_days, 3), 90))::integer as window_days,
      now() as now_ts
    from public.v2_models model
    where model.model_slug = lower(trim(p_model_slug))
      and model.hidden = false
      and model.status <> 'disabled'
  ),
  base as (
    select
      coalesce(route.provider_slug, fact.provider_model_id, 'unknown') as provider_id,
      fact.service_tier_slug as service_tier,
      fact.occurred_at,
      fact.success,
      fact.status_code,
      lower(coalesce(fact.error_code, '')) as error_code,
      nullif(lower(trim(fact.stop_reason)), '') as finish_reason,
      fact.latency_ms,
      fact.generation_ms,
      fact.throughput,
      usage.input_tokens,
      usage.output_tokens,
      usage.cached_read_tokens
    from public.v2_request_facts fact
    join params on true
    left join public.v2_model_provider_routes route
      on route.provider_model_id = fact.provider_model_id
    left join lateral (
      select
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'), 0)::bigint as input_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key = 'output_tokens'), 0)::bigint as output_tokens,
        coalesce(sum(meter.quantity) filter (where meter.meter_key in ('cached_input_tokens', 'cached_read_tokens')), 0)::bigint as cached_read_tokens
      from public.v2_request_usage meter
      where meter.request_event_id = fact.request_event_id
    ) usage on true
    where coalesce(fact.routed_model_slug, fact.requested_model_slug) = params.model_slug
      and fact.occurred_at >= params.now_ts - make_interval(days => params.window_days)
      and fact.provider_model_id is not null
      and fact.service_tier_slug is not null
  ),
  classified as (
    select base.*,
      case
        when base.success is true then 'success'
        when base.status_code = 429
          or base.error_code like '%rate limit%'
          or base.error_code like '%rate_limit%'
          or base.error_code like '%ratelimit%'
          or base.error_code like '%too many requests%'
          or base.error_code like '%quota exceeded%'
        then 'neutral'
        when base.error_code like '%abort%'
          or base.error_code like '%cancel%'
          or base.error_code like '%client_closed%'
        then 'neutral'
        else 'failure'
      end as health_outcome,
      (
        base.status_code = 429
        or base.error_code like '%rate limit%'
        or base.error_code like '%rate_limit%'
        or base.error_code like '%ratelimit%'
        or base.error_code like '%too many requests%'
        or base.error_code like '%quota exceeded%'
      ) as is_rate_limited
    from base
  ),
  aggregates as (
    select
      c.provider_id,
      c.service_tier,
      count(*)::bigint as requests,
      count(*) filter (where c.occurred_at >= (select now_ts from params) - interval '30 minutes')::bigint as requests_30m,
      count(*) filter (where c.success is true)::bigint as success_requests,
      count(*) filter (where c.health_outcome = 'failure')::bigint as failed_requests,
      count(*) filter (where c.health_outcome = 'neutral')::bigint as neutral_requests,
      count(*) filter (where c.is_rate_limited)::bigint as rate_limited_requests,
      count(*) filter (where c.health_outcome <> 'neutral')::bigint as health_requests,
      count(*) filter (where c.health_outcome = 'success')::bigint as health_success_requests,
      avg(c.latency_ms) filter (where c.success is true and c.latency_ms is not null and c.occurred_at >= (select now_ts from params) - interval '30 minutes')::numeric as avg_latency_ms_30m,
      avg(c.throughput) filter (where c.success is true and c.throughput is not null and c.occurred_at >= (select now_ts from params) - interval '30 minutes')::numeric as avg_throughput_30m,
      percentile_cont((select percentile from params)) within group (order by c.latency_ms) filter (where c.success is true and c.latency_ms is not null and c.occurred_at >= (select now_ts from params) - interval '30 minutes')::numeric as percentile_latency_ms_30m,
      percentile_cont((select percentile from params)) within group (order by c.throughput) filter (where c.success is true and c.throughput is not null and c.occurred_at >= (select now_ts from params) - interval '30 minutes')::numeric as percentile_throughput_30m,
      avg(c.latency_ms) filter (where c.success is true and c.latency_ms is not null)::numeric as avg_latency_ms,
      percentile_cont(0.5) within group (order by c.latency_ms) filter (where c.success is true and c.latency_ms is not null)::numeric as p50_latency_ms,
      percentile_cont(0.95) within group (order by c.latency_ms) filter (where c.success is true and c.latency_ms is not null)::numeric as p95_latency_ms,
      percentile_cont((select percentile from params)) within group (order by c.latency_ms) filter (where c.success is true and c.latency_ms is not null)::numeric as percentile_latency_ms,
      avg(c.generation_ms) filter (where c.success is true and c.generation_ms is not null)::numeric as avg_generation_ms,
      avg(c.throughput) filter (where c.success is true and c.throughput is not null)::numeric as avg_throughput,
      percentile_cont((select percentile from params)) within group (order by c.throughput) filter (where c.success is true and c.throughput is not null)::numeric as percentile_throughput,
      coalesce(sum(c.input_tokens + c.output_tokens), 0)::bigint as total_tokens,
      coalesce(sum(c.input_tokens) filter (where c.occurred_at >= (select now_ts from params) - interval '1 hour'), 0)::bigint as input_tokens_1h,
      coalesce(sum(c.output_tokens) filter (where c.occurred_at >= (select now_ts from params) - interval '1 hour'), 0)::bigint as output_tokens_1h,
      coalesce(sum(c.cached_read_tokens) filter (where c.occurred_at >= (select now_ts from params) - interval '1 hour'), 0)::bigint as cached_read_tokens_1h,
      coalesce(sum(c.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(c.output_tokens), 0)::bigint as output_tokens,
      max(c.occurred_at) as last_request_at
    from classified c
    group by c.provider_id, c.service_tier
  ),
  finish_reasons as (
    select grouped.provider_id, grouped.service_tier,
      jsonb_object_agg(grouped.finish_reason, grouped.reason_count order by grouped.reason_count desc, grouped.finish_reason) as counts
    from (
      select c.provider_id, c.service_tier, c.finish_reason, count(*)::bigint as reason_count
      from classified c
      where c.finish_reason is not null
      group by c.provider_id, c.service_tier, c.finish_reason
    ) grouped
    group by grouped.provider_id, grouped.service_tier
  ),
  error_codes as (
    select grouped.provider_id, grouped.service_tier,
      jsonb_object_agg(grouped.error_code, grouped.error_count order by grouped.error_count desc, grouped.error_code) as counts
    from (
      select c.provider_id, c.service_tier, c.error_code, count(*)::bigint as error_count
      from classified c
      where c.error_code <> ''
      group by c.provider_id, c.service_tier, c.error_code
    ) grouped
    group by grouped.provider_id, grouped.service_tier
  ),
  bucketed as (
    select bucket.provider_id, bucket.service_tier,
      jsonb_agg(jsonb_build_object(
        'start', bucket.bucket_start,
        'end', bucket.bucket_start + interval '1 hour',
        'requests', bucket.requests,
        'success_requests', bucket.success_requests,
        'health_requests', bucket.health_requests,
        'health_success_requests', bucket.health_success_requests,
        'uptime_pct', case when bucket.health_requests > 0 then round(bucket.health_success_requests::numeric / bucket.health_requests::numeric * 100, 2) else null end,
        'request_success_pct', case when bucket.requests > 0 then round(bucket.success_requests::numeric / bucket.requests::numeric * 100, 2) else null end,
        'avg_latency_ms', bucket.percentile_latency_ms,
        'avg_throughput', bucket.percentile_throughput
      ) order by bucket.bucket_start) as buckets
    from (
      select c.provider_id, c.service_tier, date_trunc('hour', c.occurred_at) as bucket_start,
        count(*)::bigint as requests,
        count(*) filter (where c.success is true)::bigint as success_requests,
        count(*) filter (where c.health_outcome <> 'neutral')::bigint as health_requests,
        count(*) filter (where c.health_outcome = 'success')::bigint as health_success_requests,
        percentile_cont((select percentile from params)) within group (order by c.latency_ms) filter (where c.success is true and c.latency_ms is not null)::numeric as percentile_latency_ms,
        percentile_cont((select percentile from params)) within group (order by c.throughput) filter (where c.success is true and c.throughput is not null)::numeric as percentile_throughput
      from classified c
      group by c.provider_id, c.service_tier, bucket_start
    ) bucket
    group by bucket.provider_id, bucket.service_tier
  )
  select
    aggregate.provider_id,
    aggregate.service_tier,
    coalesce(provider.name, aggregate.provider_id) as provider_name,
    aggregate.requests,
    aggregate.requests_30m,
    aggregate.success_requests,
    aggregate.failed_requests,
    aggregate.neutral_requests,
    aggregate.rate_limited_requests,
    aggregate.health_requests,
    aggregate.health_success_requests,
    case when aggregate.health_requests > 0 then round(aggregate.health_success_requests::numeric / aggregate.health_requests::numeric * 100, 2) else null end,
    case when aggregate.requests > 0 then round(aggregate.success_requests::numeric / aggregate.requests::numeric * 100, 2) else null end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.avg_latency_ms_30m, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.avg_throughput_30m, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.percentile_latency_ms_30m, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.percentile_throughput_30m, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.avg_latency_ms, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.p50_latency_ms, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.p95_latency_ms, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.percentile_latency_ms, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.avg_generation_ms, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.avg_throughput, 2) end,
    case when aggregate.service_tier = 'batch' then null else round(aggregate.percentile_throughput, 2) end,
    aggregate.total_tokens,
    aggregate.input_tokens_1h,
    aggregate.output_tokens_1h,
    aggregate.cached_read_tokens_1h,
    aggregate.input_tokens,
    aggregate.output_tokens,
    coalesce(finish_reasons.counts, '{}'::jsonb),
    coalesce(error_codes.counts, '{}'::jsonb),
    coalesce(bucketed.buckets, '[]'::jsonb),
    aggregate.last_request_at
  from aggregates aggregate
  left join public.v2_providers provider on provider.provider_slug = aggregate.provider_id
  left join finish_reasons
    on finish_reasons.provider_id = aggregate.provider_id
   and finish_reasons.service_tier = aggregate.service_tier
  left join error_codes
    on error_codes.provider_id = aggregate.provider_id
   and error_codes.service_tier = aggregate.service_tier
  left join bucketed
    on bucketed.provider_id = aggregate.provider_id
   and bucketed.service_tier = aggregate.service_tier
  order by aggregate.requests desc, aggregate.provider_id, aggregate.service_tier;
$$;

revoke execute on function public.get_v2_model_provider_tier_health_metrics(text, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_tier_health_metrics(text, integer, numeric)
  to anon, authenticated, service_role;
