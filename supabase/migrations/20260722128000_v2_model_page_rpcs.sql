-- Small model-page read contracts. Each page section can call its own stable
-- RPC without repeating catalogue joins in the Worker.
create or replace function public.get_v2_model_aliases(p_model_slug text)
returns table (alias_slug text, alias_type text)
language sql
stable
security invoker
set search_path = public
as $$
  select alias.alias_slug, alias.alias_type
  from public.v2_model_aliases alias
  where alias.model_slug = lower(trim(p_model_slug))
    and alias.enabled = true
    and (alias.effective_from is null or alias.effective_from <= now())
    and (alias.effective_to is null or alias.effective_to > now())
  order by alias.alias_slug;
$$;

create or replace function public.get_v2_model_availability(
  p_model_slug text,
  p_region text default null,
  p_service_tier text default 'standard'
)
returns table (
  is_gateway_active boolean,
  active_provider_count integer,
  active_route_count integer,
  regions text[],
  service_tiers text[]
)
language sql
stable
security invoker
set search_path = public
as $$
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
$$;

grant execute on function public.get_v2_model_aliases(text) to anon, authenticated, service_role;
grant execute on function public.get_v2_model_availability(text, text, text) to anon, authenticated, service_role;
