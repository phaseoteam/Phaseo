-- Materialise regional route variants from provider residency metadata.  A
-- global variant remains the fallback; regional variants are additional
-- eligible endpoints for providers such as Bedrock and regional AWS offers.
insert into public.v2_route_variants (
  provider_model_id, variant_key, provider_region_id, execution_region,
  data_region, service_tier_slug, status, routing_enabled, endpoint_label,
  metadata
)
select
  route.provider_model_id,
  'region:' || region.region_code || ':' || tier.service_tier_slug,
  region.provider_region_id,
  region.region_code,
  case when region.data_residency_supported then region.region_code else null end,
  tier.service_tier_slug,
  route.status,
  route.routing_enabled and region.routing_enabled,
  upper(region.region_code) || ' ' || tier.display_name,
  jsonb_build_object('source', 'v2_provider_regions')
from public.v2_model_provider_routes route
join public.v2_provider_regions region
  on region.provider_slug = route.provider_slug
join public.v2_service_tiers tier on tier.status = 'active'
where region.status = 'active'
on conflict (provider_model_id, variant_key) do update set
  provider_region_id = excluded.provider_region_id,
  execution_region = excluded.execution_region,
  data_region = excluded.data_region,
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  endpoint_label = excluded.endpoint_label,
  updated_at = now();

update public.v2_model_provider_routes route
set regions = coalesce(regions.regions, '{}'::text[]),
    updated_at = now()
from (
  select provider_model_id, array_agg(distinct region_code order by region_code) as regions
  from public.v2_model_provider_routes route_inner
  join public.v2_provider_regions region on region.provider_slug = route_inner.provider_slug
  where region.status = 'active'
  group by provider_model_id
) regions
where route.provider_model_id = regions.provider_model_id;
