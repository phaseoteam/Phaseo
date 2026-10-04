CREATE OR REPLACE FUNCTION public.get_v2_model_availability (
  p_model_slug   text,
  p_region       text DEFAULT NULL::text,
  p_service_tier text DEFAULT 'standard'::text
)
  RETURNS TABLE (
    is_gateway_active     boolean,
    active_provider_count integer,
    active_route_count    integer,
    regions               text[],
    service_tiers         text[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with candidates as (
    select *
    from public.get_v2_routing_candidates(
      lower(trim(p_model_slug)), null, p_region, p_service_tier
    )
  )
  select
    count(*) filter (where candidate.routing_enabled) > 0,
    (count(distinct candidate.provider_slug) filter (where candidate.routing_enabled))::integer,
    (count(distinct candidate.provider_model_id) filter (where candidate.routing_enabled))::integer,
    coalesce(array_agg(distinct region order by region) filter (where region is not null), '{}'::text[]),
    coalesce(array_agg(distinct candidate.service_tier_slug order by candidate.service_tier_slug), '{}'::text[])
  from candidates candidate
  cross join lateral (values (candidate.execution_region), (candidate.data_region)) regions(region);
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_availability"(text, text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_availability"(text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_availability"(text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_availability"(text, text, text) TO "postgres";
