CREATE OR REPLACE FUNCTION public.get_v2_model_provider_percentile_series_v2 (
  p_model_slug      text,
  p_cloudflare_colo text DEFAULT NULL::text,
  p_stream_mode     text DEFAULT 'all'::text,
  p_context_bucket  text DEFAULT 'all'::text
)
  RETURNS TABLE (
    usage_day                date,
    provider_id              text,
    provider_name            text,
    requests                 bigint,
    percentile               integer,
    gateway_ttft_ms          numeric,
    gateway_e2e_ms           numeric,
    provider_duration_ms     numeric,
    effective_throughput_tps numeric,
    output_speed_tps         numeric,
    phaseo_overhead_ms       numeric,
    tpot_ms                  numeric,
    itl_ms                   numeric,
    cached_input_pct         numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
select series.*
from public.v2_models model
cross join lateral public.get_v2_model_provider_percentile_series_v2_unsuppressed(
  model.model_slug,
  p_cloudflare_colo,
  p_stream_mode,
  p_context_bucket
) series
where model.model_slug = lower(trim(p_model_slug))
  and model.hidden = false
  and model.status <> 'disabled'
  and series.requests >= 20;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_percentile_series_v2"(text, text, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_model_provider_percentile_series_v2"(text, text, text, text) IS 'Returns daily single-provider performance percentiles, including end-to-end latency and cached-input share, for cohorts with at least 20 requests.';

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_percentile_series_v2"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_provider_percentile_series_v2"(text, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_provider_percentile_series_v2"(text, text, text, text) FROM PUBLIC, "anon", "authenticated";
