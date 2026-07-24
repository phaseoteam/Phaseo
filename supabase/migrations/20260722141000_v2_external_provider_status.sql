-- Catalogue providers that are known to us but are not Phaseo-routable are
-- first-class external providers. They remain visible in catalogue and
-- pricing views, but can never be selected by the routing RPC.

alter table public.v2_providers
  drop constraint if exists v2_providers_status_check;

alter table public.v2_providers
  add constraint v2_providers_status_check check (
    status in ('active', 'beta', 'alpha', 'not_ready', 'deprecated', 'disabled', 'external')
  );

update public.v2_providers
set status = 'external',
    routing_enabled = false,
    updated_at = now()
where routable = false
  and routing_enabled = false
  and (
    metadata->>'source' = 'models.dev'
    or metadata->>'gateway_kind' = 'catalogue_gateway'
  )
  and status not in ('disabled', 'deprecated', 'external');

-- The deduping wrapper was introduced in a prior migration. Keep its public
-- signature stable while excluding external providers from routing candidates.
create or replace function public.get_v2_routing_candidates(
  p_model_slug text,
  p_capability_id text default null,
  p_region text default null,
  p_service_tier text default 'standard'
)
returns table (
  provider_model_id text,
  provider_slug text,
  provider_name text,
  model_slug text,
  provider_model_slug text,
  variant_id uuid,
  service_tier_slug text,
  execution_region text,
  data_region text,
  route_status text,
  provider_status text,
  capability_status text,
  routing_enabled boolean
)
language sql
stable
security invoker
set search_path = public
as $$
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
  where candidate.provider_status not in ('disabled', 'deprecated', 'external')
  order by candidate.provider_model_id, candidate.variant_id, candidate.routing_enabled desc, candidate.capability_status;
$$;

grant execute on function public.get_v2_routing_candidates(text, text, text, text) to authenticated, service_role;

comment on column public.v2_providers.status is 'Provider lifecycle/routing status. external identifies catalogue-only providers that are not routable through Phaseo.';
