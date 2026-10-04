CREATE OR REPLACE FUNCTION public.get_v2_model_performance_metrics_unsuppressed (
  p_model_slug      text,
  p_cloudflare_colo text    DEFAULT NULL::text,
  p_percentile      numeric DEFAULT 0.5,
  p_stream_mode     text    DEFAULT 'all'::text,
  p_context_bucket  text    DEFAULT 'all'::text
)
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
    fact.success, fact.stream, fact.cloudflare_colo,
    coalesce(fact.gateway_ttft_ms, fact.time_to_first_token_ms) gateway_ttft_ms,
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
    percentile_cont((select percentile from params)) within group (order by gateway_e2e_ms)
      filter (where success and gateway_e2e_ms is not null)::numeric gateway_e2e_ms,
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
    'gateway_e2e_ms', gateway_e2e_ms,
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

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_metrics_unsuppressed"(text, text, numeric, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_performance_metrics_unsuppressed"(text, text, numeric, text, text) IS 'Unsuppressed model performance aggregates with TTFT fallback and end-to-end latency for hourly and daily provider series.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_metrics_unsuppressed"(text, text, numeric, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_metrics_unsuppressed"(text, text, numeric, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_metrics_unsuppressed"(text, text, numeric, text, text) FROM PUBLIC, "anon", "authenticated";
