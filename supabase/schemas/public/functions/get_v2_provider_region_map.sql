CREATE OR REPLACE FUNCTION public.get_v2_provider_region_map (
  p_provider_slugs text[] DEFAULT NULL::text[]
)
  RETURNS TABLE (
    provider_slug text,
    regions       text[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    region.provider_slug,
    array_agg(distinct region.region_code order by region.region_code)
  from public.v2_provider_regions region
  where region.status <> 'disabled'
    and region.routing_enabled = true
    and (p_provider_slugs is null or region.provider_slug = any(p_provider_slugs))
  group by region.provider_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_provider_region_map"(text[]) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_provider_region_map"(text[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_provider_region_map"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_provider_region_map"(text[]) TO "postgres";
