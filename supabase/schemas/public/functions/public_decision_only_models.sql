CREATE OR REPLACE FUNCTION public.public_decision_only_models ()
  RETURNS TABLE (
    model_slug text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Models that only answer /v1/decisions. They are ranked on the Decisions
  -- page, so per-model text rankings leave them out. Models that also serve
  -- text generation stay in the text rankings.
  select route.model_slug
  from public.v2_route_capabilities capability
  join public.v2_model_provider_routes route on route.provider_model_id = capability.provider_model_id
  group by route.model_slug
  having bool_or(capability.capability_id = 'decisions.make')
    and bool_and(capability.capability_id in ('decisions.make', 'batch'));
$function$;

REVOKE ALL ON FUNCTION "public"."public_decision_only_models"() FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."public_decision_only_models"() TO "service_role";
