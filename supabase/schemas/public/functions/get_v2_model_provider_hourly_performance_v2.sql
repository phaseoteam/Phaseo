CREATE OR REPLACE FUNCTION public.get_v2_model_provider_hourly_performance_v2 (
  p_model_slug      text,
  p_cloudflare_colo text    DEFAULT NULL::text,
  p_percentile      numeric DEFAULT 0.5,
  p_stream_mode     text    DEFAULT 'all'::text,
  p_context_bucket  text    DEFAULT 'all'::text
)
  RETURNS TABLE (
    bucket                     timestamp with time zone,
    provider_id                text,
    provider_name              text,
    requests                   bigint,
    gateway_ttft_ms            numeric,
    gateway_e2e_ms             numeric,
    provider_duration_ms       numeric,
    effective_throughput_tps   numeric,
    output_speed_tps           numeric,
    phaseo_overhead_ms         numeric,
    tpot_ms                    numeric,
    itl_ms                     numeric,
    tool_call_requests         bigint,
    tool_call_errors           bigint,
    structured_output_requests bigint,
    structured_output_errors   bigint,
    cache_telemetry_requests   bigint,
    cache_hit_requests         bigint,
    effective_input_tokens     numeric,
    cached_input_tokens        numeric,
    cached_input_pct           numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
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
visible_model as (
  select model.model_slug
  from public.v2_models model
  cross join params
  where model.model_slug = params.model_slug
    and model.hidden = false
    and model.status <> 'disabled'
),
scoped_facts as (
  select
    fact.request_event_id,
    fact.occurred_at,
    fact.success,
    fact.stream,
    fact.cloudflare_colo,
    fact.safe_metadata,
    fact.gateway_ttft_ms,
    fact.time_to_first_token_ms,
    fact.gateway_total_ms,
    fact.generation_ms provider_duration_ms,
    fact.phaseo_overhead_ms,
    fact.throughput effective_throughput_tps,
    fact.output_speed_tps,
    fact.tpot_ms,
    fact.itl_ms,
    fact.tool_call_count,
    fact.tool_call_succeeded,
    fact.structured_output_attempted,
    fact.structured_output_succeeded,
    route.provider_slug provider_id
  from public.v2_request_facts fact
  join visible_model
    on visible_model.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
  left join public.v2_model_provider_routes route
    on route.provider_model_id = fact.provider_model_id
  cross join params
  where fact.occurred_at >= params.now_ts - interval '7 days'
    and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
    and (params.stream_mode = 'all' or fact.stream = (params.stream_mode = 'stream'))
),
usage_by_request as (
  select
    usage.request_event_id,
    sum(usage.quantity) filter (
      where usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
    )::numeric input_tokens,
    sum(usage.quantity) filter (
      where usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')
    )::numeric cached_input_tokens,
    bool_or(usage.meter_key in ('cached_input_tokens', 'cached_read_tokens')) cache_telemetry_observed
  from scoped_facts fact
  join public.v2_request_usage usage on usage.request_event_id = fact.request_event_id
  where usage.meter_key in (
    'input_tokens',
    'input_text_tokens',
    'prompt_tokens',
    'cached_input_tokens',
    'cached_read_tokens'
  )
  group by usage.request_event_id
),
classified as (
  select
    date_trunc('hour', fact.occurred_at) bucket_start,
    fact.provider_id,
    fact.success,
    coalesce(fact.gateway_ttft_ms, fact.time_to_first_token_ms) gateway_ttft_ms,
    fact.gateway_total_ms gateway_e2e_ms,
    fact.provider_duration_ms,
    fact.phaseo_overhead_ms,
    fact.effective_throughput_tps,
    fact.output_speed_tps,
    fact.tpot_ms,
    fact.itl_ms,
    fact.tool_call_count,
    fact.tool_call_succeeded,
    fact.structured_output_attempted,
    fact.structured_output_succeeded,
    usage.input_tokens,
    usage.cached_input_tokens,
    usage.cache_telemetry_observed,
    coalesce((fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean, true) cached_input_is_subset,
    case
      when usage.input_tokens is null then null
      when coalesce((fact.safe_metadata ->> 'cached_input_tokens_are_subset_of_input')::boolean, true)
        then usage.input_tokens
      else usage.input_tokens + coalesce(usage.cached_input_tokens, 0)
    end context_input_tokens
  from scoped_facts fact
  left join usage_by_request usage on usage.request_event_id = fact.request_event_id
  cross join params
),
base as (
  select classified.*
  from classified
  cross join params
  where classified.provider_id is not null
    and (
      params.context_bucket = 'all'
      or (params.context_bucket = 'lte_4k' and classified.context_input_tokens <= 4096)
      or (params.context_bucket = '4k_16k' and classified.context_input_tokens > 4096 and classified.context_input_tokens <= 16384)
      or (params.context_bucket = '16k_64k' and classified.context_input_tokens > 16384 and classified.context_input_tokens <= 65536)
      or (params.context_bucket = 'gt_64k' and classified.context_input_tokens > 65536)
    )
),
hourly as (
  select
    base.bucket_start,
    base.provider_id,
    count(*)::bigint requests,
    percentile_cont((select percentile from params)) within group (order by base.gateway_ttft_ms)
      filter (where base.success and base.gateway_ttft_ms is not null)::numeric gateway_ttft_ms,
    percentile_cont((select percentile from params)) within group (order by base.gateway_e2e_ms)
      filter (where base.success and base.gateway_e2e_ms is not null)::numeric gateway_e2e_ms,
    percentile_cont((select percentile from params)) within group (order by base.provider_duration_ms)
      filter (where base.success and base.provider_duration_ms is not null)::numeric provider_duration_ms,
    percentile_cont((select percentile from params)) within group (order by base.effective_throughput_tps)
      filter (where base.success and base.effective_throughput_tps is not null)::numeric effective_throughput_tps,
    percentile_cont((select percentile from params)) within group (order by base.output_speed_tps)
      filter (where base.success and base.output_speed_tps is not null)::numeric output_speed_tps,
    percentile_cont((select percentile from params)) within group (order by base.phaseo_overhead_ms)
      filter (where base.success and base.phaseo_overhead_ms is not null)::numeric phaseo_overhead_ms,
    percentile_cont((select percentile from params)) within group (order by base.tpot_ms)
      filter (where base.success and base.tpot_ms is not null)::numeric tpot_ms,
    percentile_cont((select percentile from params)) within group (order by base.itl_ms)
      filter (where base.success and base.itl_ms is not null)::numeric itl_ms,
    count(*) filter (
      where base.tool_call_count > 0 and base.tool_call_succeeded is not null
    )::bigint tool_call_requests,
    count(*) filter (
      where base.tool_call_count > 0 and base.tool_call_succeeded = false
    )::bigint tool_call_errors,
    count(*) filter (where base.structured_output_attempted)::bigint structured_output_requests,
    count(*) filter (
      where base.structured_output_attempted and base.structured_output_succeeded = false
    )::bigint structured_output_errors,
    count(*) filter (where base.cache_telemetry_observed)::bigint cache_telemetry_requests,
    count(*) filter (
      where base.cache_telemetry_observed and coalesce(base.cached_input_tokens, 0) > 0
    )::bigint cache_hit_requests,
    sum(
      base.input_tokens + case when base.cached_input_is_subset then 0 else coalesce(base.cached_input_tokens, 0) end
    ) filter (where base.cache_telemetry_observed and base.input_tokens > 0)::numeric effective_input_tokens,
    sum(base.cached_input_tokens)
      filter (where base.cache_telemetry_observed and base.input_tokens > 0)::numeric cached_input_tokens
  from base
  group by base.bucket_start, base.provider_id
)
select
  hourly.bucket_start bucket,
  hourly.provider_id,
  provider.name provider_name,
  hourly.requests,
  hourly.gateway_ttft_ms,
  hourly.gateway_e2e_ms,
  hourly.provider_duration_ms,
  hourly.effective_throughput_tps,
  hourly.output_speed_tps,
  hourly.phaseo_overhead_ms,
  hourly.tpot_ms,
  hourly.itl_ms,
  hourly.tool_call_requests,
  hourly.tool_call_errors,
  hourly.structured_output_requests,
  hourly.structured_output_errors,
  case when hourly.cache_telemetry_requests >= 20 then hourly.cache_telemetry_requests else null end,
  case when hourly.cache_telemetry_requests >= 20 then hourly.cache_hit_requests else null end,
  case when hourly.cache_telemetry_requests >= 20 then hourly.effective_input_tokens else null end,
  case when hourly.cache_telemetry_requests >= 20 then hourly.cached_input_tokens else null end,
  case
    when hourly.cache_telemetry_requests >= 20 and hourly.effective_input_tokens > 0
      then least(100, hourly.cached_input_tokens * 100.0 / hourly.effective_input_tokens)
    else null
  end cached_input_pct
from hourly
join public.v2_providers provider on provider.provider_slug = hourly.provider_id
order by hourly.bucket_start, hourly.provider_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_hourly_performance_v2"(text, text, numeric, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_provider_hourly_performance_v2"(text, text, numeric, text, text) IS 'Hourly provider performance, quality success rates, token counts, and cache telemetry, suppressed below twenty aggregated requests.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_hourly_performance_v2"(text, text, numeric, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_hourly_performance_v2"(text, text, numeric, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_hourly_performance_v2"(text, text, numeric, text, text) FROM PUBLIC, "anon", "authenticated";
