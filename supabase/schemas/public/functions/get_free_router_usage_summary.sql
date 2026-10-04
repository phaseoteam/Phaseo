CREATE OR REPLACE FUNCTION public.get_free_router_usage_summary (
  p_model_slugs text[],
  p_since       timestamp with time zone
)
  RETURNS TABLE (
    model_slug       text,
    requests_30d     bigint,
    total_cost_nanos numeric,
    last_routed_at   timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with matching_usage as materialized (
    select fact.request_event_id, fact.routed_model_slug, fact.occurred_at
    from public.v2_request_facts as fact
    where fact.requested_model_input = 'phaseo/free'
      and fact.routed_model_slug = any (p_model_slugs)
      and fact.occurred_at >= p_since
  ), pricing_by_request as (
    select pricing_line.request_event_id,
      sum(pricing_line.charged_nanos) as total_cost_nanos
    from public.v2_request_pricing_lines as pricing_line
    join matching_usage as usage_row using (request_event_id)
    group by pricing_line.request_event_id
  )
  select usage_row.routed_model_slug as model_slug,
    count(*)::bigint as requests_30d,
    coalesce(sum(pricing.total_cost_nanos), 0)::numeric as total_cost_nanos,
    max(usage_row.occurred_at) as last_routed_at
  from matching_usage as usage_row
  left join pricing_by_request as pricing using (request_event_id)
  group by usage_row.routed_model_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_free_router_usage_summary"(text[], timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_free_router_usage_summary"(text[], timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_free_router_usage_summary"(text[], timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_free_router_usage_summary"(text[], timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";
