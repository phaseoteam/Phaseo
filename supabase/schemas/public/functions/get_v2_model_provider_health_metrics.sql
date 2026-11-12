CREATE OR REPLACE FUNCTION public.get_v2_model_provider_health_metrics (
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
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
select health.*
from public.v2_models model
cross join lateral public.get_v2_model_provider_health_metrics_unfiltered(
  model.model_slug,
  p_window_days,
  p_percentile
) health
where model.model_slug = lower(trim(p_model_slug))
  and model.hidden = false
  and model.status <> 'disabled';
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_health_metrics"(text, integer, numeric) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_health_metrics"(text, integer, numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_health_metrics"(text, integer, numeric) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_health_metrics"(text, integer, numeric) FROM PUBLIC, "anon", "authenticated";
