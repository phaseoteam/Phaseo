CREATE OR REPLACE FUNCTION public.get_v2_model_performance_overview (
  p_model_slug text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with hourly as (
    select bucket_start, provider_model_id,
      sum(requests)::numeric as requests,
      sum(successful_requests)::numeric as successful_requests,
      sum(latency_sum_ms)::numeric as latency_sum_ms,
      sum(latency_count)::numeric as latency_count,
      sum(generation_sum_ms)::numeric as generation_sum_ms,
      sum(generation_count)::numeric as generation_count,
      sum(throughput_sum)::numeric as throughput_sum,
      sum(throughput_count)::numeric as throughput_count
    from public.reporting_usage_hourly
    where model_slug = lower(trim(p_model_slug))
      and bucket_start >= now() - interval '5 days'
    group by bucket_start, provider_model_id
  ),
  last_day as (
    select sum(requests) as requests, sum(successful_requests) as successful_requests,
      sum(latency_sum_ms) as latency_sum_ms, sum(latency_count) as latency_count,
      sum(generation_sum_ms) as generation_sum_ms, sum(generation_count) as generation_count,
      sum(throughput_sum) as throughput_sum, sum(throughput_count) as throughput_count
    from hourly where bucket_start >= now() - interval '24 hours'
  ),
  previous_day as (
    select sum(requests) as requests, sum(successful_requests) as successful_requests,
      sum(latency_sum_ms) as latency_sum_ms, sum(latency_count) as latency_count,
      sum(generation_sum_ms) as generation_sum_ms, sum(generation_count) as generation_count,
      sum(throughput_sum) as throughput_sum, sum(throughput_count) as throughput_count
    from hourly where bucket_start >= now() - interval '48 hours' and bucket_start < now() - interval '24 hours'
  ),
  hourly_rows as (
    select bucket_start, sum(requests) as requests, sum(successful_requests) as successful_requests,
      sum(latency_sum_ms) as latency_sum_ms, sum(latency_count) as latency_count,
      sum(generation_sum_ms) as generation_sum_ms, sum(generation_count) as generation_count,
      sum(throughput_sum) as throughput_sum, sum(throughput_count) as throughput_count
    from hourly where bucket_start >= now() - interval '24 hours' group by bucket_start
  ),
  provider_rows as (
    select route.provider_slug, max(provider.name) as provider_name,
      sum(hourly.requests) as requests, sum(hourly.successful_requests) as successful_requests,
      sum(hourly.latency_sum_ms) as latency_sum_ms, sum(hourly.latency_count) as latency_count,
      sum(hourly.generation_sum_ms) as generation_sum_ms, sum(hourly.generation_count) as generation_count,
      sum(hourly.throughput_sum) as throughput_sum, sum(hourly.throughput_count) as throughput_count
    from hourly
    left join public.v2_model_provider_routes route on route.provider_model_id = hourly.provider_model_id
    left join public.v2_providers provider on provider.provider_slug = route.provider_slug
    where hourly.bucket_start >= now() - interval '24 hours'
    group by route.provider_slug
  ),
  success_buckets as (
    select jsonb_agg(jsonb_build_object('bucket', h.bucket_start, 'requests', h.requests,
      'success_pct', case when h.requests > 0 then h.successful_requests * 100.0 / h.requests else null end,
      'avg_latency_ms', case when h.latency_count > 0 then h.latency_sum_ms / h.latency_count else null end,
      'avg_generation_ms', case when h.generation_count > 0 then h.generation_sum_ms / h.generation_count else null end,
      'avg_throughput', case when h.throughput_count > 0 then h.throughput_sum / h.throughput_count else null end) order by h.bucket_start) as value
    from hourly_rows h
  ),
  provider_json as (
    select jsonb_agg(jsonb_build_object('provider', p.provider_slug, 'provider_name', p.provider_name,
      'requests', p.requests, 'uptime_pct', case when p.requests > 0 then p.successful_requests * 100.0 / p.requests else null end,
      'avg_latency_ms', case when p.latency_count > 0 then p.latency_sum_ms / p.latency_count else null end,
      'avg_generation_ms', case when p.generation_count > 0 then p.generation_sum_ms / p.generation_count else null end,
      'avg_throughput', case when p.throughput_count > 0 then p.throughput_sum / p.throughput_count else null end,
      'uptime_buckets', '[]'::jsonb) order by p.provider_name) as value
    from provider_rows p
  )
  select jsonb_build_object(
    'last_24h', jsonb_build_object('total_requests', coalesce(last.requests, 0), 'successful_requests', coalesce(last.successful_requests, 0),
      'avg_latency_ms', case when last.latency_count > 0 then last.latency_sum_ms / last.latency_count else null end,
      'avg_generation_ms', case when last.generation_count > 0 then last.generation_sum_ms / last.generation_count else null end,
      'avg_throughput', case when last.throughput_count > 0 then last.throughput_sum / last.throughput_count else null end,
      'uptime_pct', case when last.requests > 0 then last.successful_requests * 100.0 / last.requests else null end),
    'prev_24h', jsonb_build_object('total_requests', coalesce(previous.requests, 0), 'successful_requests', coalesce(previous.successful_requests, 0),
      'avg_latency_ms', case when previous.latency_count > 0 then previous.latency_sum_ms / previous.latency_count else null end,
      'avg_generation_ms', case when previous.generation_count > 0 then previous.generation_sum_ms / previous.generation_count else null end,
      'avg_throughput', case when previous.throughput_count > 0 then previous.throughput_sum / previous.throughput_count else null end,
      'uptime_pct', case when previous.requests > 0 then previous.successful_requests * 100.0 / previous.requests else null end),
    'hourly_24h', coalesce((select value from success_buckets), '[]'::jsonb),
    'provider_uptime_24h', coalesce((select value from provider_json), '[]'::jsonb),
    'time_of_day_5d', '[]'::jsonb, 'cumulative_tokens', null)
  from last_day last cross join previous_day previous;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_performance_overview (
  p_model_slug      text,
  p_cloudflare_colo text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with hourly as (
    select
      bucket_start,
      provider_model_id,
      sum(requests)::numeric as requests,
      sum(successful_requests)::numeric as successful_requests,
      sum(latency_sum_ms)::numeric as latency_sum_ms,
      sum(latency_count)::numeric as latency_count,
      sum(generation_sum_ms)::numeric as generation_sum_ms,
      sum(generation_count)::numeric as generation_count,
      sum(throughput_sum)::numeric as throughput_sum,
      sum(throughput_count)::numeric as throughput_count
    from public.reporting_usage_hourly
    where model_slug = lower(trim(p_model_slug))
      and bucket_start >= now() - interval '5 days'
      and (p_cloudflare_colo is null or cloudflare_colo = upper(trim(p_cloudflare_colo)))
    group by bucket_start, provider_model_id
  ),
  last_day as (
    select sum(requests) as requests, sum(successful_requests) as successful_requests,
      sum(latency_sum_ms) as latency_sum_ms, sum(latency_count) as latency_count,
      sum(generation_sum_ms) as generation_sum_ms, sum(generation_count) as generation_count,
      sum(throughput_sum) as throughput_sum, sum(throughput_count) as throughput_count
    from hourly where bucket_start >= now() - interval '24 hours'
  ),
  previous_day as (
    select sum(requests) as requests, sum(successful_requests) as successful_requests,
      sum(latency_sum_ms) as latency_sum_ms, sum(latency_count) as latency_count,
      sum(generation_sum_ms) as generation_sum_ms, sum(generation_count) as generation_count,
      sum(throughput_sum) as throughput_sum, sum(throughput_count) as throughput_count
    from hourly where bucket_start >= now() - interval '48 hours' and bucket_start < now() - interval '24 hours'
  ),
  hourly_rows as (
    select bucket_start, sum(requests) as requests, sum(successful_requests) as successful_requests,
      sum(latency_sum_ms) as latency_sum_ms, sum(latency_count) as latency_count,
      sum(generation_sum_ms) as generation_sum_ms, sum(generation_count) as generation_count,
      sum(throughput_sum) as throughput_sum, sum(throughput_count) as throughput_count
    from hourly where bucket_start >= now() - interval '24 hours' group by bucket_start
  ),
  provider_rows as (
    select route.provider_slug, max(provider.name) as provider_name,
      sum(hourly.requests) as requests, sum(hourly.successful_requests) as successful_requests,
      sum(hourly.latency_sum_ms) as latency_sum_ms, sum(hourly.latency_count) as latency_count,
      sum(hourly.generation_sum_ms) as generation_sum_ms, sum(hourly.generation_count) as generation_count,
      sum(hourly.throughput_sum) as throughput_sum, sum(hourly.throughput_count) as throughput_count
    from hourly
    left join public.v2_model_provider_routes route on route.provider_model_id = hourly.provider_model_id
    left join public.v2_providers provider on provider.provider_slug = route.provider_slug
    where hourly.bucket_start >= now() - interval '24 hours'
    group by route.provider_slug
  ),
  success_buckets as (
    select jsonb_agg(jsonb_build_object(
      'bucket', rows.bucket_start, 'requests', rows.requests,
      'success_pct', case when rows.requests > 0 then rows.successful_requests * 100.0 / rows.requests else null end,
      'avg_latency_ms', case when rows.latency_count > 0 then rows.latency_sum_ms / rows.latency_count else null end,
      'avg_generation_ms', case when rows.generation_count > 0 then rows.generation_sum_ms / rows.generation_count else null end,
      'avg_throughput', case when rows.throughput_count > 0 then rows.throughput_sum / rows.throughput_count else null end
    ) order by rows.bucket_start) as value from hourly_rows rows
  ),
  provider_json as (
    select jsonb_agg(jsonb_build_object(
      'provider', row.provider_slug, 'provider_name', row.provider_name, 'requests', row.requests,
      'uptime_pct', case when row.requests > 0 then row.successful_requests * 100.0 / row.requests else null end,
      'avg_latency_ms', case when row.latency_count > 0 then row.latency_sum_ms / row.latency_count else null end,
      'avg_generation_ms', case when row.generation_count > 0 then row.generation_sum_ms / row.generation_count else null end,
      'avg_throughput', case when row.throughput_count > 0 then row.throughput_sum / row.throughput_count else null end,
      'uptime_buckets', '[]'::jsonb
    ) order by row.provider_name) as value from provider_rows row
  )
  select jsonb_build_object(
    'last_24h', jsonb_build_object(
      'total_requests', coalesce(last.requests, 0), 'successful_requests', coalesce(last.successful_requests, 0),
      'avg_latency_ms', case when last.latency_count > 0 then last.latency_sum_ms / last.latency_count else null end,
      'avg_generation_ms', case when last.generation_count > 0 then last.generation_sum_ms / last.generation_count else null end,
      'avg_throughput', case when last.throughput_count > 0 then last.throughput_sum / last.throughput_count else null end,
      'uptime_pct', case when last.requests > 0 then last.successful_requests * 100.0 / last.requests else null end
    ),
    'prev_24h', jsonb_build_object(
      'total_requests', coalesce(previous.requests, 0), 'successful_requests', coalesce(previous.successful_requests, 0),
      'avg_latency_ms', case when previous.latency_count > 0 then previous.latency_sum_ms / previous.latency_count else null end,
      'avg_generation_ms', case when previous.generation_count > 0 then previous.generation_sum_ms / previous.generation_count else null end,
      'avg_throughput', case when previous.throughput_count > 0 then previous.throughput_sum / previous.throughput_count else null end,
      'uptime_pct', case when previous.requests > 0 then previous.successful_requests * 100.0 / previous.requests else null end
    ),
    'hourly_24h', coalesce((select value from success_buckets), '[]'::jsonb),
    'provider_uptime_24h', coalesce((select value from provider_json), '[]'::jsonb),
    'time_of_day_5d', '[]'::jsonb,
    'cumulative_tokens', null,
    'cloudflare_colo', nullif(upper(trim(p_cloudflare_colo)), '')
  )
  from last_day last cross join previous_day previous;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_performance_overview (
  p_model_slug      text,
  p_cloudflare_colo text    DEFAULT NULL::text,
  p_percentile      numeric DEFAULT 0.5
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with params as (
    select lower(trim(p_model_slug)) as model_slug,
      nullif(upper(trim(p_cloudflare_colo)), '') as cloudflare_colo,
      greatest(0.01, least(0.99, coalesce(p_percentile, 0.5)))::double precision as percentile,
      now() as now_ts
  ),
  base as (
    select date_trunc('hour', fact.occurred_at) as bucket_start,
      fact.occurred_at::date as usage_day,
      route.provider_slug as provider_id,
      fact.success, fact.latency_ms, fact.generation_ms, fact.throughput
    from public.reporting_request_facts fact
    left join public.v2_model_provider_routes route
      on route.provider_model_id = fact.provider_model_id
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text, text) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text, text, numeric) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text, text, numeric) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_performance_overview"(text, text, numeric) IS 'Returns model performance percentiles; provider series include only real v2 catalogue providers.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_overview"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_overview"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_overview"(text, text, numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_overview"(text, text, numeric) TO "postgres";
