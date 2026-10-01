-- Aggregate Free Models Router usage in the database instead of transferring
-- every matching request fact and pricing line to the web worker.
create or replace function public.get_free_router_usage_summary(
  p_model_slugs text[],
  p_since timestamptz
)
returns table (
  model_slug text,
  requests_30d bigint,
  total_cost_nanos numeric,
  last_routed_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $function$
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

revoke all on function public.get_free_router_usage_summary(text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_free_router_usage_summary(text[], timestamptz)
  to service_role;

notify pgrst, 'reload schema';
