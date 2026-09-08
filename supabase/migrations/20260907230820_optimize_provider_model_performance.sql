-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- phaseo:allow-production-history-backfill reason: Version 20260907230820 is already applied in production; restore its recorded SQL without replaying it.
-- Original version and SQL are retained; this migration is already applied in production.

set local lock_timeout='5s';
-- Avoid repeated performance evaluation, unneeded token aggregation, and model-route fan-out.
-- Existing RPC signatures, privileges, percentile calculations and public wrappers are retained.

CREATE OR REPLACE FUNCTION public.get_public_provider_usage_summary()
 RETURNS TABLE(provider text, requests_24h bigint, tokens_24h numeric, tokens_30d numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with hourly as (
    select
      usage.provider,
      coalesce(sum(usage.requests), 0)::bigint as requests_24h,
      coalesce(sum(usage.total_tokens), 0)::numeric as tokens_24h
    from (
with meters as (
  select
    meter.rollup_id,
    coalesce(
      max(meter.quantity) filter (where meter.meter_key = 'total_tokens'),
      sum(meter.quantity) filter (where meter.meter_key in ('input_tokens', 'output_tokens')),
      sum(meter.quantity) filter (where meter.meter_key in ('input_text_tokens', 'output_text_tokens')),
      0
    )::numeric as total_tokens
  from public.v2_public_usage_hourly_meters meter
  join public.v2_public_usage_hourly scoped on scoped.rollup_id = meter.rollup_id
  where scoped.bucket_start >= now() - interval '24 hours'
  group by meter.rollup_id
)
select
  usage.bucket_start as bucket_15m,
  usage.model_slug as canonical_model_id,
  route.provider_slug as provider,
  usage.app_id,
  usage.requests,
  usage.successful_requests as success_requests,
  coalesce(meters.total_tokens, 0) as total_tokens,
  usage.cost_nanos::bigint as total_cost_nanos,
  usage.latency_sum_ms,
  usage.latency_count as latency_samples,
  usage.throughput_sum,
  usage.throughput_count as throughput_samples,
  usage.generation_sum_ms,
  usage.generation_count as generation_samples
from public.v2_public_usage_hourly usage
join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
  and coalesce(route.is_stealth, false) = false
  and route.routing_enabled = true
  and route.status in ('active', 'degraded')
  and (route.effective_from is null or route.effective_from <= now())
  and (route.effective_to is null or route.effective_to > now())
join public.v2_models model
  on model.model_slug = usage.model_slug
  and model.hidden = false
  and model.status <> 'disabled'
left join meters on meters.rollup_id = usage.rollup_id
) usage
    where usage.provider is not null
      and usage.bucket_15m >= now() - interval '24 hours'
    group by usage.provider
  ),
  daily as (
    select
      usage.provider,
      coalesce(sum(usage.total_tokens), 0)::numeric as tokens_30d
    from (
with meters as (
  select
    meter.rollup_id,
    coalesce(
      max(meter.quantity) filter (where meter.meter_key = 'total_tokens'),
      sum(meter.quantity) filter (where meter.meter_key in ('input_tokens', 'output_tokens')),
      sum(meter.quantity) filter (where meter.meter_key in ('input_text_tokens', 'output_text_tokens')),
      0
    )::numeric as total_tokens
  from public.v2_public_usage_daily_meters meter
  join public.v2_public_usage_daily scoped on scoped.rollup_id = meter.rollup_id
  where scoped.usage_date >= current_date - 29
  group by meter.rollup_id
)
select
  usage.usage_date as day_bucket,
  usage.model_slug as canonical_model_id,
  route.provider_slug as provider,
  usage.app_id,
  usage.requests,
  usage.successful_requests as success_requests,
  coalesce(meters.total_tokens, 0) as total_tokens,
  usage.cost_nanos::bigint as total_cost_nanos,
  usage.latency_sum_ms,
  usage.latency_count as latency_samples,
  usage.throughput_sum,
  usage.throughput_count as throughput_samples,
  usage.generation_sum_ms,
  usage.generation_count as generation_samples
from public.v2_public_usage_daily usage
join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
  and coalesce(route.is_stealth, false) = false
  and route.routing_enabled = true
  and route.status in ('active', 'degraded')
  and (route.effective_from is null or route.effective_from <= now())
  and (route.effective_to is null or route.effective_to > now())
join public.v2_models model
  on model.model_slug = usage.model_slug
  and model.hidden = false
  and model.status <> 'disabled'
left join meters on meters.rollup_id = usage.rollup_id
) usage
    where usage.provider is not null
      and usage.day_bucket >= current_date - 29
    group by usage.provider
  ),
  providers as (
    select hourly.provider from hourly
    union
    select daily.provider from daily
  )
  select
    providers.provider,
    coalesce(hourly.requests_24h, 0),
    coalesce(hourly.tokens_24h, 0),
    coalesce(daily.tokens_30d, 0)
  from providers
  left join hourly using (provider)
  left join daily using (provider)
  order by providers.provider;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_performance_metrics_unsuppressed(p_model_slug text, p_cloudflare_colo text DEFAULT NULL::text, p_percentile numeric DEFAULT 0.5, p_stream_mode text DEFAULT 'all'::text, p_context_bucket text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with params as (
  select
    lower(trim(p_model_slug)) model_slug,
    nullif(upper(trim(p_cloudflare_colo)), '') cloudflare_colo,
    greatest(0.01, least(0.99, coalesce(p_percentile, 0.5)))::double precision percentile,
    case when lower(p_stream_mode) in ('stream', 'non_stream') then lower(p_stream_mode) else 'all' end stream_mode,
    case when lower(p_context_bucket) in ('lte_4k', '4k_16k', '16k_64k', 'gt_64k') then lower(p_context_bucket) else 'all' end context_bucket,
    now() now_ts
),
scoped_facts as materialized (
  select fact.request_event_id, fact.occurred_at, fact.provider_model_id,
    fact.success, fact.stream, fact.cloudflare_colo, fact.gateway_ttft_ms,
    fact.provider_ttft_ms, fact.generation_ms, fact.gateway_total_ms,
    fact.phaseo_overhead_ms, fact.throughput, fact.output_speed_tps, fact.tpot_ms, fact.itl_ms
  from public.v2_request_facts fact
  cross join params
  where coalesce(fact.routed_model_slug, fact.requested_model_slug) = params.model_slug
    and fact.occurred_at >= params.now_ts - interval '7 days'
    and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
    and (params.stream_mode = 'all' or fact.stream = (params.stream_mode = 'stream'))
),
usage_tokens as (
  select usage.request_event_id,
    sum(usage.quantity) filter (where usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens'))::numeric input_tokens
  from public.v2_request_usage usage
  join scoped_facts on scoped_facts.request_event_id = usage.request_event_id
  cross join params
  where params.context_bucket <> 'all'
    and usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
  group by usage.request_event_id
),
base as (
  select date_trunc('hour', fact.occurred_at) bucket_start,
    fact.occurred_at::date usage_day,
    route.provider_slug provider_id,
    fact.success, fact.stream, tokens.input_tokens,
    fact.gateway_ttft_ms, fact.provider_ttft_ms, fact.generation_ms provider_duration_ms,
    fact.gateway_total_ms gateway_e2e_ms, fact.phaseo_overhead_ms,
    fact.throughput effective_throughput_tps, fact.output_speed_tps,
    fact.tpot_ms, fact.itl_ms
  from scoped_facts fact
  left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
  left join usage_tokens tokens on tokens.request_event_id = fact.request_event_id
  cross join params
  where (
      params.context_bucket = 'all'
      or (params.context_bucket = 'lte_4k' and tokens.input_tokens <= 4096)
      or (params.context_bucket = '4k_16k' and tokens.input_tokens > 4096 and tokens.input_tokens <= 16384)
      or (params.context_bucket = '16k_64k' and tokens.input_tokens > 16384 and tokens.input_tokens <= 65536)
      or (params.context_bucket = 'gt_64k' and tokens.input_tokens > 65536)
    )
),
hourly as (
  select bucket_start, count(*)::bigint requests,
    count(*) filter (where success)::bigint successful_requests,
    percentile_cont((select percentile from params)) within group (order by gateway_ttft_ms)
      filter (where success and gateway_ttft_ms is not null)::numeric gateway_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by provider_ttft_ms)
      filter (where success and provider_ttft_ms is not null)::numeric provider_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by provider_duration_ms)
      filter (where success and provider_duration_ms is not null)::numeric provider_duration_ms,
    percentile_cont((select percentile from params)) within group (order by gateway_e2e_ms)
      filter (where success and gateway_e2e_ms is not null)::numeric gateway_e2e_ms,
    percentile_cont((select percentile from params)) within group (order by phaseo_overhead_ms)
      filter (where success and phaseo_overhead_ms is not null)::numeric phaseo_overhead_ms,
    percentile_cont((select percentile from params)) within group (order by effective_throughput_tps)
      filter (where success and effective_throughput_tps is not null)::numeric effective_throughput_tps,
    percentile_cont((select percentile from params)) within group (order by output_speed_tps)
      filter (where success and output_speed_tps is not null)::numeric output_speed_tps,
    percentile_cont((select percentile from params)) within group (order by tpot_ms)
      filter (where success and tpot_ms is not null)::numeric tpot_ms,
    percentile_cont((select percentile from params)) within group (order by itl_ms)
      filter (where success and itl_ms is not null)::numeric itl_ms
  from base group by bucket_start
),
provider_daily as (
  select usage_day, provider_id, count(*)::bigint requests,
    percentile_cont((select percentile from params)) within group (order by gateway_ttft_ms)
      filter (where success and gateway_ttft_ms is not null)::numeric gateway_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by provider_duration_ms)
      filter (where success and provider_duration_ms is not null)::numeric provider_duration_ms,
    percentile_cont((select percentile from params)) within group (order by effective_throughput_tps)
      filter (where success and effective_throughput_tps is not null)::numeric effective_throughput_tps,
    percentile_cont((select percentile from params)) within group (order by output_speed_tps)
      filter (where success and output_speed_tps is not null)::numeric output_speed_tps,
    percentile_cont((select percentile from params)) within group (order by phaseo_overhead_ms)
      filter (where success and phaseo_overhead_ms is not null)::numeric phaseo_overhead_ms,
    percentile_cont((select percentile from params)) within group (order by tpot_ms)
      filter (where success and tpot_ms is not null)::numeric tpot_ms,
    percentile_cont((select percentile from params)) within group (order by itl_ms)
      filter (where success and itl_ms is not null)::numeric itl_ms
  from base where provider_id is not null group by usage_day, provider_id
),
recent as (select * from base where bucket_start >= (select now_ts from params) - interval '24 hours'),
summary as (
  select count(*)::bigint requests, count(*) filter (where success)::bigint successful_requests,
    percentile_cont((select percentile from params)) within group (order by gateway_ttft_ms) filter (where success and gateway_ttft_ms is not null)::numeric gateway_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by provider_duration_ms) filter (where success and provider_duration_ms is not null)::numeric provider_duration_ms,
    percentile_cont((select percentile from params)) within group (order by effective_throughput_tps) filter (where success and effective_throughput_tps is not null)::numeric effective_throughput_tps,
    percentile_cont((select percentile from params)) within group (order by output_speed_tps) filter (where success and output_speed_tps is not null)::numeric output_speed_tps,
    percentile_cont((select percentile from params)) within group (order by phaseo_overhead_ms) filter (where success and phaseo_overhead_ms is not null)::numeric phaseo_overhead_ms,
    percentile_cont((select percentile from params)) within group (order by tpot_ms) filter (where success and tpot_ms is not null)::numeric tpot_ms,
    percentile_cont((select percentile from params)) within group (order by itl_ms) filter (where success and itl_ms is not null)::numeric itl_ms
  from recent
)
select jsonb_build_object(
  'percentile', (select percentile * 100 from params),
  'stream_mode', (select stream_mode from params),
  'context_bucket', (select context_bucket from params),
  'cloudflare_colo', (select cloudflare_colo from params),
  'last_24h', jsonb_build_object(
    'total_requests', summary.requests, 'successful_requests', summary.successful_requests,
    'uptime_pct', case when summary.requests > 0 then summary.successful_requests * 100.0 / summary.requests else null end,
    'gateway_ttft_ms', summary.gateway_ttft_ms, 'avg_latency_ms', summary.gateway_ttft_ms,
    'provider_duration_ms', summary.provider_duration_ms, 'avg_generation_ms', summary.provider_duration_ms,
    'effective_throughput_tps', summary.effective_throughput_tps, 'avg_throughput', summary.effective_throughput_tps,
    'output_speed_tps', summary.output_speed_tps, 'phaseo_overhead_ms', summary.phaseo_overhead_ms,
    'tpot_ms', summary.tpot_ms, 'itl_ms', summary.itl_ms
  ),
  'prev_24h', null,
  'hourly_24h', coalesce((select jsonb_agg(jsonb_build_object(
    'bucket', bucket_start, 'requests', requests,
    'success_pct', case when requests > 0 then successful_requests * 100.0 / requests else null end,
    'gateway_ttft_ms', gateway_ttft_ms, 'avg_latency_ms', gateway_ttft_ms,
    'provider_ttft_ms', provider_ttft_ms,
    'provider_duration_ms', provider_duration_ms, 'avg_generation_ms', provider_duration_ms,
    'gateway_e2e_ms', gateway_e2e_ms, 'phaseo_overhead_ms', phaseo_overhead_ms,
    'effective_throughput_tps', effective_throughput_tps, 'avg_throughput', effective_throughput_tps,
    'output_speed_tps', output_speed_tps, 'tpot_ms', tpot_ms, 'itl_ms', itl_ms
  ) order by bucket_start) from hourly where bucket_start >= (select now_ts from params) - interval '24 hours'), '[]'::jsonb),
  'provider_uptime_24h', '[]'::jsonb,
  'provider_daily_7d', coalesce((select jsonb_agg(jsonb_build_object(
    'day', usage_day, 'provider', provider_id, 'provider_name', provider.name, 'requests', requests,
    'gateway_ttft_ms', gateway_ttft_ms, 'avg_latency_ms', gateway_ttft_ms,
    'provider_duration_ms', provider_duration_ms, 'avg_generation_ms', provider_duration_ms,
    'effective_throughput_tps', effective_throughput_tps, 'avg_throughput', effective_throughput_tps,
    'output_speed_tps', output_speed_tps, 'phaseo_overhead_ms', phaseo_overhead_ms,
    'tpot_ms', tpot_ms, 'itl_ms', itl_ms
  ) order by usage_day, provider_id)
  from provider_daily join public.v2_providers provider on provider.provider_slug = provider_id), '[]'::jsonb),
  'time_of_day_5d', '[]'::jsonb,
  'cumulative_tokens', null
) from summary;
$function$;

CREATE OR REPLACE FUNCTION public.get_v2_model_performance_metrics(p_model_slug text, p_cloudflare_colo text DEFAULT NULL::text, p_percentile numeric DEFAULT 0.5, p_stream_mode text DEFAULT 'all'::text, p_context_bucket text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with raw as materialized (
  select public.get_v2_model_performance_metrics_unsuppressed(
    model.model_slug, p_cloudflare_colo, p_percentile, p_stream_mode, p_context_bucket
  ) payload
  from public.v2_models model
  where model.model_slug = lower(trim(p_model_slug))
    and model.hidden = false
    and model.status <> 'disabled'
), redacted as materialized (
  select
    jsonb_set(
      jsonb_set(
        payload,
        '{provider_uptime_24h}',
        coalesce((
          select jsonb_agg(
            case when exists (
              select 1 from public.v2_model_provider_routes route
              where route.model_slug = lower(trim(p_model_slug))
                and route.provider_slug = entry ->> 'provider'
                and route.is_stealth = true
            ) then entry || jsonb_build_object('provider', 'stealth', 'provider_name', 'stealth')
            else entry end
            order by entry ->> 'provider'
          )
          from jsonb_array_elements(coalesce(payload -> 'provider_uptime_24h', '[]'::jsonb)) entry
        ), '[]'::jsonb)
      ),
      '{provider_daily_7d}',
      coalesce((
        select jsonb_agg(
          case when exists (
            select 1 from public.v2_model_provider_routes route
            where route.model_slug = lower(trim(p_model_slug))
              and route.provider_slug = entry ->> 'provider'
              and route.is_stealth = true
          ) then entry || jsonb_build_object('provider', 'stealth', 'provider_name', 'stealth')
          else entry end
          order by entry ->> 'day', entry ->> 'provider'
        )
        from jsonb_array_elements(coalesce(payload -> 'provider_daily_7d', '[]'::jsonb)) entry
      ), '[]'::jsonb)
    ) payload
  from raw
), suppressed as (
  select
    case when coalesce((payload #>> '{last_24h,total_requests}')::bigint, 0) >= 20
      then payload -> 'last_24h' else '{}'::jsonb end last_24h,
    case when coalesce((payload #>> '{prev_24h,total_requests}')::bigint, 0) >= 20
      then payload -> 'prev_24h' else '{}'::jsonb end prev_24h,
    coalesce((select jsonb_agg(entry order by entry ->> 'bucket')
      from jsonb_array_elements(coalesce(payload -> 'hourly_24h', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 20), '[]'::jsonb) hourly_24h,
    coalesce((select jsonb_agg(entry order by entry ->> 'day', entry ->> 'provider')
      from jsonb_array_elements(coalesce(payload -> 'provider_daily_7d', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 20), '[]'::jsonb) provider_daily_7d,
    coalesce((select jsonb_agg(entry order by entry ->> 'provider')
      from jsonb_array_elements(coalesce(payload -> 'provider_uptime_24h', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 20), '[]'::jsonb) provider_uptime_24h,
    payload
  from redacted
)
select jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(payload, '{last_24h}', last_24h),
        '{prev_24h}', prev_24h
      ),
      '{hourly_24h}', hourly_24h
    ),
    '{provider_daily_7d}', provider_daily_7d
  ),
  '{provider_uptime_24h}', provider_uptime_24h
)
from suppressed;
$function$;

CREATE OR REPLACE FUNCTION public.get_model_performance_overview(p_model_id text)
 RETURNS TABLE(last_24h jsonb, prev_24h jsonb, hourly_24h jsonb, provider_uptime_24h jsonb, hourly_5d jsonb, time_of_day_5d jsonb, cumulative_tokens jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$with params as (
    select p_model_id as model_id
),
anchors as (
    select
        date_trunc('hour', now() at time zone 'utc') as now_hour,
        (select release_date from private.v2_rpc_models_compat where model_id = p_model_id limit 1) as release_date
),
windows as (
    select
        now_hour,
        now_hour - interval '24 hours' as last24_start,
        now_hour - interval '48 hours' as prev24_start,
        now_hour - interval '120 hours' as last5d_start
    from anchors
),
-- Resolve the request's actual route, not every route belonging to its model.
requests_all as materialized (
    select fact.occurred_at as created_at, fact.success::boolean as success_bool,
        fact.latency_ms, fact.throughput, fact.generation_ms, route.provider_slug as provider
    from public.v2_request_facts fact
    left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
    cross join windows w
    where coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input) = p_model_id
      and fact.occurred_at >= w.last5d_start and fact.occurred_at < w.now_hour
),
requests_last24 as (
    select * from requests_all, windows w
    where created_at >= w.last24_start and created_at < w.now_hour
),
requests_prev24 as (
    select * from requests_all, windows w
    where created_at >= w.prev24_start and created_at < w.last24_start
),
requests_5d as (
    select * from requests_all, windows w
    where created_at >= w.last5d_start and created_at < w.now_hour
),
median_or_null as (
    select 1 as dummy
),
last_24h as (
    select jsonb_build_object(
        'avg_throughput', case when count(*) filter (where throughput is not null) > 0
            then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
            else null end,
        'avg_latency_ms', case when count(*) filter (where latency_ms is not null) > 0
            then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
            else null end,
        'avg_generation_ms', case when count(*) filter (where generation_ms is not null) > 0
            then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
            else null end,
        'uptime_pct', case when count(*) > 0 then (count(*) filter (where success_bool) * 100.0 / count(*)) else null end,
        'total_requests', count(*),
        'successful_requests', count(*) filter (where success_bool)
    ) as value
    from requests_last24
),
prev_24h as (
    select jsonb_build_object(
        'avg_throughput', case when count(*) filter (where throughput is not null) > 0
            then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
            else null end,
        'avg_latency_ms', case when count(*) filter (where latency_ms is not null) > 0
            then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
            else null end,
        'avg_generation_ms', case when count(*) filter (where generation_ms is not null) > 0
            then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
            else null end,
        'uptime_pct', case when count(*) > 0 then (count(*) filter (where success_bool) * 100.0 / count(*)) else null end,
        'total_requests', count(*),
        'successful_requests', count(*) filter (where success_bool)
    ) as value
    from requests_prev24
),
hourly_24h as (
    select coalesce(jsonb_agg(bucket_json order by bucket_start), '[]'::jsonb) as value
    from (
        select
            s.bucket_start,
            jsonb_build_object(
                'bucket', s.bucket_start,
                'avg_throughput', case when count(r.*) filter (where r.throughput is not null) > 0
                    then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
                    else null end,
                'avg_latency_ms', case when count(r.*) filter (where r.latency_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
                    else null end,
                'avg_generation_ms', case when count(r.*) filter (where r.generation_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
                    else null end,
                'requests', count(r.*),
                'success_pct', case when count(r.*) > 0 then (count(*) filter (where r.success_bool) * 100.0 / count(r.*)) else null end,
                'worst_provider_success_pct',
                    (
                        select min(pct) from (
                            select case when count(*) > 0 then (count(*) filter (where r2.success_bool) * 100.0 / count(*)) else null end as pct
                            from requests_last24 r2
                            where r2.created_at >= s.bucket_start
                              and r2.created_at < s.bucket_start + interval '1 hour'
                            group by r2.provider
                        ) provider_stats
                    )
            ) as bucket_json
        from (
            select generate_series(w.last24_start, w.now_hour, interval '1 hour') as bucket_start
            from windows w
        ) s
        left join requests_last24 r
            on r.created_at >= s.bucket_start
           and r.created_at < s.bucket_start + interval '1 hour'
        group by s.bucket_start
    ) buckets
),
provider_uptime_24h as (
    select coalesce(jsonb_agg(provider_json order by requests desc), '[]'::jsonb) as value
    from (
        select
            r.provider,
            count(*) as requests,
            jsonb_build_object(
                'provider', r.provider,
                'provider_name', coalesce(p.api_provider_name, r.provider),
                'avg_throughput', case when count(*) filter (where r.throughput is not null) > 0
                    then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
                    else null end,
                'avg_latency_ms', case when count(*) filter (where r.latency_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
                    else null end,
                'avg_generation_ms', case when count(*) filter (where r.generation_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
                    else null end,
                'requests', count(*),
                'uptime_pct', case when count(*) > 0 then (count(*) filter (where r.success_bool) * 100.0 / count(*)) else null end,
                'uptime_buckets',
                    (
                        select jsonb_agg(bucket_json order by bucket_end asc)
                        from (
                            select
                                bucket_end,
                                jsonb_build_object(
                                    'start', bucket_end - interval '6 hours',
                                    'end', bucket_end,
                                    'success_pct', case when count(pr.*) > 0 then (count(*) filter (where pr.success_bool) * 100.0 / count(pr.*)) else null end
                                ) as bucket_json
                            from (
                                select generate_series(
                                    w.last24_start,
                                    w.now_hour,
                                    interval '6 hours'
                                ) as bucket_end
                                from windows w
                            ) buckets
                            left join requests_last24 pr
                                on pr.provider = r.provider
                               and pr.created_at > buckets.bucket_end - interval '6 hours'
                               and pr.created_at <= buckets.bucket_end
                            group by bucket_end
                        ) per_bucket
                    )
            ) as provider_json
        from requests_last24 r
        left join private.v2_rpc_providers_compat p on p.api_provider_id = r.provider
        group by r.provider, p.api_provider_name
    ) provider_rows
),
hourly_5d as (
    select coalesce(jsonb_agg(bucket_json order by bucket_start), '[]'::jsonb) as value
    from (
        select
            s.bucket_start,
            jsonb_build_object(
                'bucket', s.bucket_start,
                'avg_throughput', case when count(r.*) filter (where r.throughput is not null) > 0
                    then percentile_cont(0.5) within group (order by r.throughput) filter (where r.throughput is not null)
                    else null end,
                'avg_latency_ms', case when count(r.*) filter (where r.latency_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.latency_ms) filter (where r.latency_ms is not null)
                    else null end,
                'avg_generation_ms', case when count(r.*) filter (where r.generation_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by r.generation_ms) filter (where r.generation_ms is not null)
                    else null end,
                'requests', count(r.*),
                'success_pct', case when count(r.*) > 0 then (count(*) filter (where r.success_bool) * 100.0 / count(r.*)) else null end
            ) as bucket_json
        from (
            select generate_series(w.last5d_start, w.now_hour, interval '1 hour') as bucket_start
            from windows w
        ) s
        left join requests_5d r
            on r.created_at >= s.bucket_start
           and r.created_at < s.bucket_start + interval '1 hour'
        group by s.bucket_start
    ) buckets
),
time_of_day_5d as (
    select coalesce(jsonb_agg(hour_json order by hour), '[]'::jsonb) as value
    from (
        select
            hour,
            jsonb_build_object(
                'hour', hour,
                'avg_throughput', case when count(*) filter (where throughput is not null) > 0
                    then percentile_cont(0.5) within group (order by throughput) filter (where throughput is not null)
                    else null end,
                'avg_latency_ms', case when count(*) filter (where latency_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null)
                    else null end,
                'avg_generation_ms', case when count(*) filter (where generation_ms is not null) > 0
                    then percentile_cont(0.5) within group (order by generation_ms) filter (where generation_ms is not null)
                    else null end,
                'sample_count', count(*)
            ) as hour_json
        from (
            select
                extract(hour from created_at) as hour,
                throughput,
                latency_ms,
                generation_ms
            from requests_5d
        ) r
        group by hour
    ) hours
),
-- Count each request's token total once; total_tokens already includes input/output.
token_totals as (
    select coalesce(sum(tokens.total_tokens), 0) as total_tokens
    from public.v2_request_facts fact
    left join lateral (
        select coalesce(
            sum(usage.quantity) filter (where usage.meter_key = 'total_tokens'),
            sum(usage.quantity) filter (where usage.meter_key in ('input_tokens', 'output_tokens')),
            sum(usage.quantity) filter (where usage.meter_key in ('input_text_tokens', 'output_text_tokens')),
            sum(usage.quantity) filter (where usage.meter_key in ('prompt_tokens', 'completion_tokens')),
            0
        ) as total_tokens
        from public.v2_request_usage usage
        where usage.request_event_id = fact.request_event_id
    ) tokens on true
    where coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input) = p_model_id
)
select
    (select value from last_24h) as last_24h,
    (select value from prev_24h) as prev_24h,
    (select value from hourly_24h) as hourly_24h,
    (select value from provider_uptime_24h) as provider_uptime_24h,
    (select value from hourly_5d) as hourly_5d,
    (select value from time_of_day_5d) as time_of_day_5d,
    jsonb_build_object(
        'release_date', (select release_date from anchors),
        'total_tokens', (select total_tokens from token_totals)
    ) as cumulative_tokens;$function$;
