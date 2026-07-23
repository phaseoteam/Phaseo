-- Bridge unambiguous v2 canonical model slugs into the compatibility routing
-- catalogue used by gateway_fetch_request_context during the v2 cutover.
--
-- A canonical slug is bridged only when every enabled v2 provider route maps
-- to one and the same active legacy API model. Ambiguous models are deliberately
-- left unresolved so the gateway cannot silently choose the wrong variant.

with unambiguous_routes as (
  select
    route.model_slug,
    min(legacy.api_model_id) as api_model_id
  from public.v2_model_provider_routes route
  join public.v2_models model
    on model.model_slug = route.model_slug
  join public.v2_providers provider
    on provider.provider_slug = route.provider_slug
  join public.data_api_provider_models legacy
    on legacy.provider_api_model_id = route.provider_model_id
  where model.status in ('active', 'deprecated')
    and model.hidden = false
    and provider.status not in ('disabled', 'deprecated')
    and provider.routing_enabled = true
    and provider.routable = true
    and route.status in ('active', 'degraded')
    and route.routing_enabled = true
    and legacy.is_active_gateway = true
    and (route.effective_from is null or route.effective_from <= now())
    and (route.effective_to is null or route.effective_to > now())
    and (legacy.effective_from is null or legacy.effective_from <= now())
    and (legacy.effective_to is null or legacy.effective_to > now())
  group by route.model_slug
  having count(distinct legacy.api_model_id) = 1
)
insert into public.data_api_model_aliases (
  alias_slug,
  api_model_id,
  channel,
  is_enabled,
  notes
)
select
  mapping.model_slug,
  mapping.api_model_id,
  'v2-canonical',
  true,
  'Generated from an unambiguous enabled v2 provider-route mapping.'
from unambiguous_routes mapping
where mapping.model_slug <> mapping.api_model_id
on conflict (alias_slug) do nothing;

comment on table public.data_api_model_aliases is
  'Compatibility aliases, including conservative v2-canonical bridges while gateway request context migrates to v2 routing tables.';
