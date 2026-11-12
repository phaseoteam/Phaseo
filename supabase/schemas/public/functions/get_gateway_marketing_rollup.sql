CREATE OR REPLACE FUNCTION public.get_gateway_marketing_rollup (
  p_hours integer DEFAULT 24
)
  RETURNS TABLE (
    bucket_hour      timestamp with time zone,
    requests         bigint,
    success_requests bigint,
    total_tokens     bigint,
    latency_sum_ms   numeric,
    latency_samples  bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  select
    date_trunc('hour', r.bucket_15m) as bucket_hour,
    sum(r.requests)::bigint as requests,
    sum(r.success_requests)::bigint as success_requests,
    sum(r.total_tokens)::bigint as total_tokens,
    sum(r.latency_sum_ms)::numeric as latency_sum_ms,
    sum(r.latency_samples)::bigint as latency_samples
  from public.v2_web_public_usage_hourly r
  where r.bucket_15m >= now() - make_interval(hours => greatest(1, p_hours))
  group by date_trunc('hour', r.bucket_15m)
  order by date_trunc('hour', r.bucket_15m);
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_gateway_marketing_rollup"(integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_marketing_rollup"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_gateway_marketing_rollup"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_gateway_marketing_rollup"(integer) TO "postgres";
