CREATE OR REPLACE FUNCTION public.v2_model_has_routable_route (
  p_model_slug text,
  p_at         timestamp with time zone DEFAULT now()
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  -- Mirrors the route filter in gateway_fetch_public_catalog_at for any endpoint,
  -- ignoring model status: this asks whether a provider still serves the model.
  -- BYOK-only routes count as served.
  select exists (
    select 1
    from public.v2_model_provider_routes r
    join public.v2_providers p on p.provider_slug=r.provider_slug
    join public.v2_route_capabilities c on c.provider_model_id=r.provider_model_id
    where r.model_slug=p_model_slug
      and r.routing_enabled
      and (p.status <> 'external' or coalesce(r.metadata->>'external_routing_override', 'false') = 'true')
      and (r.effective_from is null or r.effective_from<=p_at)
      and (r.effective_to is null or p_at<r.effective_to)
      and c.status in ('active','deranked','deranked_lvl1','deranked_lvl2','deranked_lvl3')
      and (c.effective_from is null or c.effective_from<=p_at)
      and (c.effective_to is null or p_at<c.effective_to)
  )
$function$;

GRANT EXECUTE ON FUNCTION "public"."v2_model_has_routable_route"(text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."v2_model_has_routable_route"(text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."v2_model_has_routable_route"(text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."v2_model_has_routable_route"(text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
