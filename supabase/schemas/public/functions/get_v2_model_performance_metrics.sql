CREATE OR REPLACE FUNCTION public.get_v2_model_performance_metrics (
  p_model_slug      text,
  p_cloudflare_colo text    DEFAULT NULL::text,
  p_percentile      numeric DEFAULT 0.5,
  p_stream_mode     text    DEFAULT 'all'::text,
  p_context_bucket  text    DEFAULT 'all'::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
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
    case when coalesce((payload #>> '{last_24h,total_requests}')::bigint, 0) >= 1
      then payload -> 'last_24h' else '{}'::jsonb end last_24h,
    case when coalesce((payload #>> '{prev_24h,total_requests}')::bigint, 0) >= 1
      then payload -> 'prev_24h' else '{}'::jsonb end prev_24h,
    coalesce((select jsonb_agg(entry order by entry ->> 'bucket')
      from jsonb_array_elements(coalesce(payload -> 'hourly_24h', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 1), '[]'::jsonb) hourly_24h,
    coalesce((select jsonb_agg(entry order by entry ->> 'day', entry ->> 'provider')
      from jsonb_array_elements(coalesce(payload -> 'provider_daily_7d', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 1), '[]'::jsonb) provider_daily_7d,
    coalesce((select jsonb_agg(entry order by entry ->> 'provider')
      from jsonb_array_elements(coalesce(payload -> 'provider_uptime_24h', '[]'::jsonb)) entry
      where coalesce((entry ->> 'requests')::bigint, 0) >= 1), '[]'::jsonb) provider_uptime_24h,
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

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_metrics"(text, text, numeric, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_metrics"(text, text, numeric, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_performance_metrics"(text, text, numeric, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_performance_metrics"(text, text, numeric, text, text) FROM PUBLIC, "anon", "authenticated";
