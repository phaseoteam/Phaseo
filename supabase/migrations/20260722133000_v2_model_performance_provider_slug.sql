create or replace function public.get_v2_model_performance_overview(p_model_slug text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
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
    from public.v2_public_usage_hourly
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
$$;

grant execute on function public.get_v2_model_performance_overview(text) to anon, authenticated, service_role;
