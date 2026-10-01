-- phaseo:allow-production-history-backfill reason: Restore SQL already applied as production migration 20260917100626 so deployment history matches the repository.
-- External providers remain catalogue-labelled, but a provider-level
-- routable flag can explicitly opt a specific provider into API routing.
update public.v2_providers
set status = 'external',
    routable = true,
    routing_enabled = true,
    updated_at = now()
where provider_slug = 'openrouter';

-- Keep the public candidate helper closed to external providers by default.
-- An external provider is returned only when its provider row explicitly opts
-- into routing with both routable and routing_enabled enabled.
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
  where candidate.provider_status not in ('disabled', 'deprecated')
    and (
      candidate.provider_status <> 'external'
      or exists (
        select 1
        from public.v2_providers provider
        where provider.provider_slug = candidate.provider_slug
          and provider.status = 'external'
          and provider.routable = true
          and provider.routing_enabled = true
      )
    )
  order by candidate.provider_model_id, candidate.variant_id, candidate.routing_enabled desc, candidate.capability_status;
$$;

grant execute on function public.get_v2_routing_candidates(text, text, text, text) to authenticated, service_role;

comment on column public.v2_providers.status is 'Provider lifecycle/routing status. external identifies providers that are shown as external and remain non-routable unless explicitly opted in.';
comment on column public.v2_providers.routable is 'Provider-level routing opt-in. External providers require this flag, in addition to routing_enabled, to participate in routing.';
