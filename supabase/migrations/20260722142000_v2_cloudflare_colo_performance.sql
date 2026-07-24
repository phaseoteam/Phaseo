-- Cloudflare execution colo support for v2 observability and performance.
--
-- Cloudflare exposes the edge execution location as `colo`: a three-letter
-- IATA-style code (for example LHR, SJC, or SIN). Keep the code in the
-- analytics facts/rollups and resolve human-readable labels at the edge/UI.

alter table public.v2_request_facts
  add column if not exists cloudflare_colo text;

alter table public.v2_request_attempts
  add column if not exists cloudflare_colo text;

alter table public.v2_private_usage_daily
  add column if not exists cloudflare_colo text;

alter table public.v2_public_usage_daily
  add column if not exists cloudflare_colo text;

alter table public.v2_public_usage_hourly
  add column if not exists cloudflare_colo text;

alter table public.v2_request_facts
  drop constraint if exists v2_request_facts_cloudflare_colo_check;
alter table public.v2_request_facts
  add constraint v2_request_facts_cloudflare_colo_check
  check (cloudflare_colo is null or cloudflare_colo ~ '^[A-Z0-9]{3}$');

alter table public.v2_request_attempts
  drop constraint if exists v2_request_attempts_cloudflare_colo_check;
alter table public.v2_request_attempts
  add constraint v2_request_attempts_cloudflare_colo_check
  check (cloudflare_colo is null or cloudflare_colo ~ '^[A-Z0-9]{3}$');

alter table public.v2_private_usage_daily
  drop constraint if exists v2_private_usage_daily_cloudflare_colo_check;
alter table public.v2_private_usage_daily
  add constraint v2_private_usage_daily_cloudflare_colo_check
  check (cloudflare_colo is null or cloudflare_colo ~ '^[A-Z0-9]{3}$');

alter table public.v2_public_usage_daily
  drop constraint if exists v2_public_usage_daily_cloudflare_colo_check;
alter table public.v2_public_usage_daily
  add constraint v2_public_usage_daily_cloudflare_colo_check
  check (cloudflare_colo is null or cloudflare_colo ~ '^[A-Z0-9]{3}$');

alter table public.v2_public_usage_hourly
  drop constraint if exists v2_public_usage_hourly_cloudflare_colo_check;
alter table public.v2_public_usage_hourly
  add constraint v2_public_usage_hourly_cloudflare_colo_check
  check (cloudflare_colo is null or cloudflare_colo ~ '^[A-Z0-9]{3}$');

-- A colo is part of the rollup grain. Rebuild the old indexes so requests
-- from two execution locations cannot be merged into one performance bucket.
drop index if exists public.v2_private_usage_daily_key;
create unique index v2_private_usage_daily_key
  on public.v2_private_usage_daily (
    workspace_id,
    usage_date,
    coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid),
    model_slug,
    coalesce(provider_model_id, ''),
    coalesce(cloudflare_colo, '')
  );

drop index if exists public.v2_public_usage_daily_key;
create unique index v2_public_usage_daily_key
  on public.v2_public_usage_daily (
    usage_date,
    coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid),
    model_slug,
    coalesce(provider_model_id, ''),
    coalesce(cloudflare_colo, '')
  );

drop index if exists public.v2_public_usage_hourly_key;
create unique index v2_public_usage_hourly_key
  on public.v2_public_usage_hourly (
    bucket_start,
    coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid),
    model_slug,
    coalesce(provider_model_id, ''),
    coalesce(cloudflare_colo, '')
  );

create index if not exists v2_request_facts_model_colo_time_idx
  on public.v2_request_facts (requested_model_slug, cloudflare_colo, occurred_at desc)
  where cloudflare_colo is not null;
create index if not exists v2_request_facts_routed_colo_time_idx
  on public.v2_request_facts (routed_model_slug, cloudflare_colo, occurred_at desc)
  where cloudflare_colo is not null;
create index if not exists v2_public_usage_daily_model_colo_date_idx
  on public.v2_public_usage_daily (model_slug, cloudflare_colo, usage_date desc)
  where cloudflare_colo is not null;
create index if not exists v2_public_usage_hourly_model_colo_bucket_idx
  on public.v2_public_usage_hourly (model_slug, cloudflare_colo, bucket_start desc)
  where cloudflare_colo is not null;

create or replace function public.get_v2_model_performance_colos(p_model_slug text)
returns table (cloudflare_colo text, request_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    upper(trim(usage.cloudflare_colo)) as cloudflare_colo,
    sum(usage.requests)::bigint as request_count
  from public.v2_public_usage_hourly usage
  where usage.model_slug = lower(trim(p_model_slug))
    and usage.cloudflare_colo is not null
    and usage.bucket_start >= now() - interval '30 days'
  group by upper(trim(usage.cloudflare_colo))
  order by request_count desc, cloudflare_colo asc;
$$;

grant execute on function public.get_v2_model_performance_colos(text)
  to anon, authenticated, service_role;

-- Region-aware overload. The original one-argument function remains available
-- for existing callers while the web API opts into the colo predicate.
create or replace function public.get_v2_model_performance_overview(
  p_model_slug text,
  p_cloudflare_colo text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
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
    from public.v2_public_usage_hourly
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
$$;

grant execute on function public.get_v2_model_performance_overview(text, text)
  to anon, authenticated, service_role;

comment on column public.v2_request_facts.cloudflare_colo is 'Cloudflare request execution colo, stored as the three-character edge code (for example LHR).';
comment on column public.v2_request_attempts.cloudflare_colo is 'Cloudflare execution colo associated with the gateway request attempt.';
comment on column public.v2_public_usage_hourly.cloudflare_colo is 'Execution colo dimension for region-filtered public performance analytics.';
