CREATE OR REPLACE FUNCTION public.get_v2_model_provider_health_metrics_unfiltered (
  p_model_slug  text,
  p_window_days integer DEFAULT 3,
  p_percentile  numeric DEFAULT 0.5
)
  RETURNS TABLE (
    provider_id               text,
    provider_name             text,
    requests                  bigint,
    requests_30m              bigint,
    success_requests          bigint,
    failed_requests           bigint,
    neutral_requests          bigint,
    rate_limited_requests     bigint,
    health_requests           bigint,
    health_success_requests   bigint,
    uptime_pct                numeric,
    request_success_pct       numeric,
    avg_latency_ms_30m        numeric,
    avg_throughput_30m        numeric,
    percentile_latency_ms_30m numeric,
    percentile_throughput_30m numeric,
    avg_latency_ms            numeric,
    p50_latency_ms            numeric,
    p95_latency_ms            numeric,
    percentile_latency_ms     numeric,
    avg_generation_ms         numeric,
    avg_throughput            numeric,
    percentile_throughput     numeric,
    total_tokens              bigint,
    input_tokens_1h           bigint,
    output_tokens_1h          bigint,
    cached_read_tokens_1h     bigint,
    input_tokens              bigint,
    output_tokens             bigint,
    finish_reason_counts      jsonb,
    error_code_counts         jsonb,
    buckets                   jsonb,
    last_request_at           timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with params as (
    select
      lower(trim(p_model_slug)) as model_slug,
      greatest(0.01, least(0.99, coalesce(p_percentile, 0.5)))::double precision as percentile,
      greatest(1, least(coalesce(p_window_days, 3), 90))::integer as window_days,
      now() as now_ts
  ),
  base as (
    select
      coalesce(route.provider_slug, fact.provider_model_id, 'unknown') as provider_id,
      fact.occurred_at,
      fact.success,
      nullif(lower(trim(fact.stop_reason)), '') as finish_reason,
      fact.status_code,
      lower(coalesce(fact.error_code, '')) as error_code,
      fact.latency_ms,
      fact.generation_ms,
      fact.throughput
    from public.v2_request_facts fact
    left join public.v2_model_provider_routes route
      on route.provider_model_id = fact.provider_model_id
    cross join params
    where coalesce(fact.routed_model_slug, fact.requested_model_slug) = params.model_slug
      and fact.occurred_at >= params.now_ts - make_interval(days => params.window_days)
      and fact.provider_model_id is not null
  ),
  classified as (
    select base.*,
      case
        when base.success is true and base.finish_reason is distinct from 'error' then 'success'
        when base.status_code in (400, 403, 413)
        then 'neutral'
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
      (base.status_code = 429
        or base.error_code like '%rate limit%'
        or base.error_code like '%rate_limit%'
        or base.error_code like '%ratelimit%'
        or base.error_code like '%too many requests%'
        or base.error_code like '%quota exceeded%') as is_rate_limited
    from base
  ),
  aggregates as (
    select
      c.provider_id,
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
      max(c.occurred_at) as last_request_at
    from classified c
    group by c.provider_id
  ),
  bucketed as (
    select c.provider_id,
      jsonb_agg(jsonb_build_object(
        'start', c.bucket_start,
        'end', c.bucket_start + interval '1 hour',
        'requests', c.requests,
        'success_requests', c.success_requests,
        'health_requests', c.health_requests,
        'health_success_requests', c.health_success_requests,
        'uptime_pct', case when c.health_requests > 0 then round(c.health_success_requests::numeric / c.health_requests::numeric * 100, 2) else null end,
        'request_success_pct', case when c.requests > 0 then round(c.success_requests::numeric / c.requests::numeric * 100, 2) else null end,
        'avg_latency_ms', c.percentile_latency_ms,
        'avg_throughput', c.percentile_throughput
      ) order by c.bucket_start) as buckets
    from (
      select provider_id, date_trunc('hour', occurred_at) as bucket_start,
        count(*)::bigint as requests,
        count(*) filter (where success is true)::bigint as success_requests,
        count(*) filter (where health_outcome <> 'neutral')::bigint as health_requests,
        count(*) filter (where health_outcome = 'success')::bigint as health_success_requests,
        percentile_cont((select percentile from params)) within group (order by latency_ms) filter (where success is true and latency_ms is not null)::numeric as percentile_latency_ms,
        percentile_cont((select percentile from params)) within group (order by throughput) filter (where success is true and throughput is not null)::numeric as percentile_throughput
      from classified
      group by provider_id, bucket_start
    ) c
    group by c.provider_id
  )
  select
    a.provider_id,
    coalesce(provider.name, a.provider_id) as provider_name,
    a.requests, a.requests_30m, a.success_requests, a.failed_requests, a.neutral_requests,
    a.rate_limited_requests, a.health_requests, a.health_success_requests,
    case when a.health_requests > 0 then round(a.health_success_requests::numeric / a.health_requests::numeric * 100, 2) else null end,
    case when a.requests > 0 then round(a.success_requests::numeric / a.requests::numeric * 100, 2) else null end,
    round(a.avg_latency_ms_30m, 2), round(a.avg_throughput_30m, 2), round(a.percentile_latency_ms_30m, 2), round(a.percentile_throughput_30m, 2),
    round(a.avg_latency_ms, 2), round(a.p50_latency_ms, 2), round(a.p95_latency_ms, 2), round(a.percentile_latency_ms, 2),
    round(a.avg_generation_ms, 2), round(a.avg_throughput, 2), round(a.percentile_throughput, 2),
    0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
    '{}'::jsonb, '{}'::jsonb, coalesce(bucketed.buckets, '[]'::jsonb), a.last_request_at
  from aggregates a
  left join public.v2_providers provider on provider.provider_slug = a.provider_id
  left join bucketed on bucketed.provider_id = a.provider_id
  order by a.requests desc, a.provider_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_health_metrics_unfiltered"(text, integer, numeric) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_health_metrics_unfiltered"(text, integer, numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_health_metrics_unfiltered"(text, integer, numeric) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_health_metrics_unfiltered"(text, integer, numeric) FROM PUBLIC, "anon", "authenticated";
