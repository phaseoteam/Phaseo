CREATE OR REPLACE FUNCTION public.get_v2_routing_candidates (
  p_model_slug    text,
  p_capability_id text DEFAULT NULL::text,
  p_region        text DEFAULT NULL::text,
  p_service_tier  text DEFAULT 'standard'::text
)
  RETURNS TABLE (
    provider_model_id   text,
    provider_slug       text,
    provider_name       text,
    model_slug          text,
    provider_model_slug text,
    variant_id          uuid,
    service_tier_slug   text,
    execution_region    text,
    data_region         text,
    route_status        text,
    provider_status     text,
    capability_status   text,
    routing_enabled     boolean
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select distinct on (candidate.provider_model_id, candidate.variant_id)
    candidate.provider_model_id,
    candidate.provider_slug,
    candidate.provider_name,
    candidate.model_slug,
    candidate.provider_model_slug,
    candidate.variant_id,
    candidate.service_tier_slug,
    candidate.execution_region,
    candidate.data_region,
    candidate.route_status,
    candidate.provider_status,
    candidate.capability_status,
    candidate.routing_enabled
  from public.get_v2_routing_candidates_raw(p_model_slug, p_capability_id, p_region, p_service_tier) candidate
  where candidate.provider_status not in ('disabled', 'deprecated')
    and (
      candidate.provider_status <> 'external'
      or exists (
        select 1
        from public.v2_model_provider_routes route_override
        where route_override.provider_model_id = candidate.provider_model_id
          and route_override.provider_slug = candidate.provider_slug
          and route_override.routing_enabled = true
          and coalesce(route_override.metadata->>'external_routing_override', 'false') = 'true'
      )
    )
  order by candidate.provider_model_id, candidate.variant_id, candidate.routing_enabled desc, candidate.capability_status;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_routing_candidates"(text, text, text, text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_routing_candidates"(text, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_routing_candidates"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_routing_candidates"(text, text, text, text) TO "postgres";
