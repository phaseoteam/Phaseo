CREATE OR REPLACE FUNCTION public.get_v2_model_cached_input_metrics (
  p_model_slug      text,
  p_cloudflare_colo text DEFAULT NULL::text,
  p_stream_mode     text DEFAULT 'all'::text,
  p_context_bucket  text DEFAULT 'all'::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
with params as (
  select
    lower(trim(p_model_slug)) model_slug,
    nullif(upper(trim(p_cloudflare_colo)), '') cloudflare_colo,
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
    fact.stream,
    fact.cloudflare_colo,
    fact.safe_metadata,
    route.provider_slug provider_id
  from public.v2_request_facts fact
  join visible_model on visible_model.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
  left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
  cross join params
  where fact.occurred_at >= params.now_ts - interval '7 days'
    and (params.cloudflare_colo is null or upper(trim(fact.cloudflare_colo)) = params.cloudflare_colo)
    and (params.stream_mode = 'all' or fact.stream = (params.stream_mode = 'stream'))
),
usage_by_request as (
  select
    usage.request_event_id,
    sum(usage.quantity) filter (where usage.meter_key = 'input_tokens')::numeric input_tokens,
    sum(usage.quantity) filter (where usage.meter_key = 'cached_input_tokens')::numeric cached_input_tokens,
    bool_or(usage.meter_key = 'cached_input_tokens') cache_telemetry_observed
  from scoped_facts fact
  join public.v2_request_usage usage on usage.request_event_id = fact.request_event_id
  where usage.meter_key in ('input_tokens', 'cached_input_tokens')
  group by usage.request_event_id
),
classified as (
  select
    date_trunc('hour', fact.occurred_at) bucket_start,
    fact.occurred_at::date usage_day,
    fact.provider_id,
    usage.input_tokens,
    usage.cached_input_tokens,
    usage.cache_telemetry_observed,
    -- Existing observations predate this metadata bit and came from
    -- OpenAI-compatible responses, where cached tokens are a subset of input.
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
  where (
      params.context_bucket = 'all'
      or (params.context_bucket = 'lte_4k' and context_input_tokens <= 4096)
      or (params.context_bucket = '4k_16k' and context_input_tokens > 4096 and context_input_tokens <= 16384)
      or (params.context_bucket = '16k_64k' and context_input_tokens > 16384 and context_input_tokens <= 65536)
      or (params.context_bucket = 'gt_64k' and context_input_tokens > 65536)
    )
),
hourly as (
  select
    bucket_start,
    count(*)::bigint requests,
    count(*) filter (where cache_telemetry_observed)::bigint telemetry_requests,
    sum(input_tokens + case when cached_input_is_subset then 0 else coalesce(cached_input_tokens, 0) end)
      filter (where cache_telemetry_observed and input_tokens > 0)::numeric input_tokens,
    sum(cached_input_tokens) filter (where cache_telemetry_observed and input_tokens > 0)::numeric cached_input_tokens
  from base
  where bucket_start >= (select now_ts from params) - interval '24 hours'
  group by bucket_start
),
provider_daily as (
  select
    usage_day,
    provider_id,
    count(*)::bigint requests,
    count(*) filter (where cache_telemetry_observed)::bigint telemetry_requests,
    sum(input_tokens + case when cached_input_is_subset then 0 else coalesce(cached_input_tokens, 0) end)
      filter (where cache_telemetry_observed and input_tokens > 0)::numeric input_tokens,
    sum(cached_input_tokens) filter (where cache_telemetry_observed and input_tokens > 0)::numeric cached_input_tokens
  from base
  where provider_id is not null
  group by usage_day, provider_id
)
select jsonb_build_object(
  'hourly_24h', coalesce((
    select jsonb_agg(jsonb_build_object(
      'bucket', bucket_start,
      'requests', requests,
      'telemetry_requests', telemetry_requests,
      'effective_input_tokens', input_tokens,
      'cached_input_tokens', cached_input_tokens,
      'cached_input_pct', case when input_tokens > 0 then least(100, cached_input_tokens * 100.0 / input_tokens) else null end
    ) order by bucket_start)
    from hourly
    where telemetry_requests >= 20
  ), '[]'::jsonb),
  'provider_daily_7d', coalesce((
    select jsonb_agg(jsonb_build_object(
      'day', daily.usage_day,
      'provider', daily.provider_id,
      'provider_name', provider.name,
      'requests', daily.requests,
      'telemetry_requests', daily.telemetry_requests,
      'effective_input_tokens', daily.input_tokens,
      'cached_input_tokens', daily.cached_input_tokens,
      'cached_input_pct', case when daily.input_tokens > 0 then least(100, daily.cached_input_tokens * 100.0 / daily.input_tokens) else null end
    ) order by daily.usage_day, daily.provider_id)
    from provider_daily daily
    join public.v2_providers provider on provider.provider_slug = daily.provider_id
    where daily.telemetry_requests >= 20
  ), '[]'::jsonb)
);
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_cached_input_metrics"(text, text, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_cached_input_metrics"(text, text, text, text) IS 'Token-weighted cached input percentage over time and by provider, suppressed below twenty aggregated requests.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_cached_input_metrics"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_cached_input_metrics"(text, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_cached_input_metrics"(text, text, text, text) FROM PUBLIC, "anon", "authenticated";
