CREATE OR REPLACE FUNCTION public.get_private_usage_facets (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
select coalesce(jsonb_agg(to_jsonb(facet) order by canonical_model_id, provider, app_id), '[]'::jsonb)
from (
  select distinct usage.model_slug as canonical_model_id, route.provider_slug as provider, usage.app_id
  from public.v2_private_usage_daily usage
  left join public.v2_model_provider_routes route using (provider_model_id)
  where usage.workspace_id = p_workspace_id
    and usage.usage_date >= p_from::date and usage.usage_date <= p_to::date
    and usage.usage_date::timestamptz >= p_from
    and usage.usage_date::timestamptz <= p_to
) facet;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_facets"(uuid, timestamp WITH time zone, timestamp WITH time zone) FROM PUBLIC, "anon";
