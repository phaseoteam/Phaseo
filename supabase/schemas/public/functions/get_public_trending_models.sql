CREATE OR REPLACE FUNCTION public.get_public_trending_models (
  p_limit        integer DEFAULT 20,
  p_min_requests integer DEFAULT 0
)
  RETURNS TABLE (
    model_id               text,
    provider               text,
    current_week_requests  bigint,
    previous_week_requests bigint,
    two_weeks_ago_requests bigint,
    velocity               numeric,
    momentum_score         numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with weekly as (
    select usage.model_slug, coalesce(route.provider_slug,'unknown') as provider,
      sum(usage.requests) filter (where usage.usage_date >= current_date - 7)::bigint as week_0,
      sum(usage.requests) filter (where usage.usage_date >= current_date - 14 and usage.usage_date < current_date - 7)::bigint as week_1,
      sum(usage.requests) filter (where usage.usage_date >= current_date - 21 and usage.usage_date < current_date - 14)::bigint as week_2
    from public.v2_public_usage_daily usage
    left join public.v2_model_provider_routes route on route.provider_model_id = usage.provider_model_id
    where usage.usage_date >= current_date - 21 and lower(usage.model_slug) not in ('unknown','other')
    group by usage.model_slug, coalesce(route.provider_slug,'unknown')
  )
  select model_slug, provider, coalesce(week_0,0), coalesce(week_1,0), coalesce(week_2,0),
    ((coalesce(week_0,0)-coalesce(week_1,0))-(coalesce(week_1,0)-coalesce(week_2,0)))::numeric,
    (((coalesce(week_0,0)-coalesce(week_1,0))-(coalesce(week_1,0)-coalesce(week_2,0)))*2.0 + (coalesce(week_0,0)-coalesce(week_1,0)))::numeric
  from weekly
  where coalesce(week_0,0) >= p_min_requests and coalesce(week_0,0) > coalesce(week_1,0)
  order by 7 desc limit greatest(1, least(coalesce(p_limit,20),100));
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_trending_models"(integer, integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_trending_models"(integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_public_trending_models"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_trending_models"(integer, integer) TO "postgres";
