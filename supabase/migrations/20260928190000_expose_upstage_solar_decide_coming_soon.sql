-- Show Upstage on Solar Decide's catalogue entry while pricing and a live probe
-- are pending. Routing stays disabled and Decisions remains internal testing.

update public.v2_model_provider_routes
set status = 'active',
    routing_enabled = false,
    provider_availability_status = 'coming_soon',
    phaseo_status = 'testing',
    updated_at = now()
where model_slug = 'upstage/solar-decide'
  and provider_slug = 'upstage'
  and provider_model_slug = 'solar-decide';

update public.v2_route_variants variant
set status = 'active',
    routing_enabled = false,
    updated_at = now()
from public.v2_model_provider_routes route
where route.provider_model_id = variant.provider_model_id
  and route.model_slug = 'upstage/solar-decide'
  and route.provider_slug = 'upstage'
  and route.provider_model_slug = 'solar-decide'
  and variant.variant_key = 'global:standard';
