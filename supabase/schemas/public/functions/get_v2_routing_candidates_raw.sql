CREATE OR REPLACE FUNCTION public.get_v2_routing_candidates_raw (
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
  select
    route.provider_model_id,
    route.provider_slug,
    provider.name,
    route.model_slug,
    route.provider_model_slug,
    variant.variant_id,
    variant.service_tier_slug,
    variant.execution_region,
    variant.data_region,
    route.status,
    provider.status,
    coalesce(capability.status, 'active'),
    route.routing_enabled and provider.routing_enabled and variant.routing_enabled
  from public.v2_model_provider_routes route
  join public.v2_providers provider on provider.provider_slug = route.provider_slug
  join public.v2_route_variants variant on variant.provider_model_id = route.provider_model_id
  left join lateral (
    select capability.status
    from public.v2_route_capabilities capability
    where capability.provider_model_id = route.provider_model_id
      and (p_capability_id is null or capability.capability_id = p_capability_id)
    order by case when capability.status = 'active' then 0 else 1 end, capability.capability_id
    limit 1
  ) capability on true
  where route.model_slug = lower(p_model_slug)
    and route.status in ('active', 'degraded')
    and provider.status not in ('disabled', 'deprecated')
    and variant.status in ('active', 'degraded')
    and (route.effective_from is null or route.effective_from <= now())
    and (route.effective_to is null or route.effective_to > now())
    and (
      route.provider_availability_status in ('available', 'preview', 'limited_access')
      or (
        route.provider_availability_status = 'deprecated'
        and route.effective_to is not null
        and route.effective_to > now()
      )
    )
    and (
      p_capability_id is null
      or capability.status = 'active'
      or (
        capability.status = 'degraded'
        and route.provider_availability_status = 'deprecated'
        and route.effective_to is not null
        and route.effective_to > now()
      )
    )
    and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
    and (
      p_region is null
      or lower(p_region) = lower(coalesce(variant.execution_region, ''))
      or lower(p_region) = lower(coalesce(variant.data_region, ''))
    )
  order by (route.routing_enabled and provider.routing_enabled and variant.routing_enabled) desc,
    case route.status when 'active' then 0 else 1 end,
    provider.name,
    route.provider_model_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_routing_candidates_raw"(text, text, text, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_routing_candidates_raw"(text, text, text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_routing_candidates_raw"(text, text, text, text) IS 'Internal routing candidate query with provider/model, region, tier, capability, and status gates evaluated in SQL.';

REVOKE ALL ON FUNCTION "public"."get_v2_routing_candidates_raw"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_routing_candidates_raw"(text, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_routing_candidates_raw"(text, text, text, text) FROM PUBLIC, "anon";
