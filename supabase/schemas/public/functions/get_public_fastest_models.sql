CREATE OR REPLACE FUNCTION public.get_public_fastest_models (
  p_days  integer DEFAULT 30,
  p_limit integer DEFAULT 20
)
  RETURNS TABLE (
    model_id           text,
    provider           text,
    requests           bigint,
    cost_per_1m_tokens numeric,
    median_latency_ms  numeric,
    p95_latency_ms     numeric,
    median_throughput  numeric,
    success_rate       numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select performance.*
  from public.get_public_model_performance(
    greatest(1, least(coalesce(p_days, 30), 365)) * 24,
    0
  ) performance
  where performance.median_throughput is not null
     or performance.median_latency_ms is not null
  order by performance.requests desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_fastest_models"(integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_fastest_models"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_fastest_models"(integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_public_fastest_models"(integer, integer) FROM PUBLIC, "anon", "authenticated";
