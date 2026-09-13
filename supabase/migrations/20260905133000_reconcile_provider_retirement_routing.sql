-- Provider-offer deprecations remain routable during their explicit migration
-- window. Canonical model lifecycle is independent and is not changed here.
-- phaseo:allow-destructive-migration reason: Replace the routing check so a
-- provider route can remain enabled until its effective_to retirement date.
alter table public.v2_model_provider_routes
  drop constraint if exists v2_model_provider_routes_provider_routing_check;

alter table public.v2_model_provider_routes
  add constraint v2_model_provider_routes_provider_routing_check check (
    not routing_enabled
    or provider_availability_status in ('available', 'preview', 'limited_access', 'deprecated')
  );

-- The public routing wrapper delegates to this raw helper. Keep a future
-- provider deprecation eligible when the capability was normalized to
-- degraded by the importer, while still honoring the route retirement window.
create or replace function public.get_v2_routing_candidates_raw(
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
$$;

grant execute on function public.get_v2_routing_candidates_raw(text, text, text, text)
  to authenticated, service_role;

-- The pricing projection is also the gateway metadata source. Patch the
-- service-only function behind the stealth-redaction wrapper so its active
-- flag and route lifecycle dates match the importer and gateway checks.
do $$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)'::regprocedure
  ) into definition;

  patched := replace(
    definition,
    'variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      capability.capability_id,',
    'variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      route.effective_from,
      route.effective_to,
      capability.capability_id,'
  );
  patched := replace(
    patched,
    'and model.provider_availability_status in (''available'', ''preview'', ''limited_access''),',
    'and (
          model.provider_availability_status in (''available'', ''preview'', ''limited_access'')
          or (
            model.provider_availability_status = ''deprecated''
            and model.effective_to is not null
            and model.effective_to > now()
          )
        ),'
  );
  patched := replace(
    patched,
    '''data_region'', model.data_region',
    '''data_region'', model.data_region,
        ''effective_from'', model.effective_from,
        ''effective_to'', model.effective_to'
  );

  if patched = definition
    or position('route.effective_from' in patched) = 0
    or position('model.provider_availability_status = ''deprecated''' in patched) = 0
    or position('''effective_to'', model.effective_to' in patched) = 0
  then
    raise exception 'get_v2_model_pricing_without_stealth_redaction has an unexpected definition';
  end if;

  execute patched;
end;
$$;

revoke all on function public.get_v2_routing_candidates_raw(text, text, text, text)
  from public, anon;
grant execute on function public.get_v2_routing_candidates_raw(text, text, text, text)
  to authenticated, service_role;


