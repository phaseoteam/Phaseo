CREATE OR REPLACE FUNCTION public.get_public_summary_stats()
  RETURNS TABLE (
    total_requests_24h bigint,
    total_tokens_24h   bigint,
    total_models       integer,
    total_providers    integer,
    avg_latency_ms     numeric,
    success_rate_24h   numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with meters as (
    select meter.rollup_id, sum(meter.quantity) filter (where meter.meter_key in ('input_tokens','output_tokens'))::bigint as tokens
    from public.v2_public_usage_hourly_meters meter group by meter.rollup_id
  ), aggregate as (
    select sum(usage.requests)::bigint as requests, sum(coalesce(meters.tokens,0))::bigint as tokens,
      count(distinct usage.model_slug)::integer as models, count(distinct route.provider_slug)::integer as providers,
      sum(usage.latency_sum_ms)::numeric as latency_sum, sum(usage.latency_count)::bigint as latency_count,
      sum(usage.successful_requests)::bigint as successes
    from public.v2_public_usage_hourly usage
    left join meters on meters.rollup_id = usage.rollup_id
    left join public.v2_model_provider_routes route on route.provider_model_id = usage.provider_model_id
    where usage.bucket_start >= now() - interval '24 hours'
  )
  select coalesce(requests,0), coalesce(tokens,0), coalesce(models,0), coalesce(providers,0),
    round(latency_sum / nullif(latency_count,0),0), round(successes::numeric / nullif(requests,0),4)
  from aggregate;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_summary_stats"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_summary_stats"() TO "service_role";

COMMENT ON FUNCTION "public"."get_public_summary_stats"() IS 'Overall gateway statistics for summary cards';

REVOKE ALL ON FUNCTION "public"."get_public_summary_stats"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_summary_stats"() TO "postgres";
