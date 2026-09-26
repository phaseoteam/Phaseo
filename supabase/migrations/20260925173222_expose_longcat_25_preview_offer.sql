-- Expose the announced LongCat preview offer on model pages without enabling routing.
insert into public.v2_route_variants (
  provider_model_id,
  variant_key,
  provider_region_id,
  execution_region,
  data_region,
  service_tier_slug,
  status,
  routing_enabled,
  endpoint_label,
  metadata
)
values (
  'longcat:meituan/longcat-2.5-preview',
  'global:standard',
  null,
  null,
  null,
  'standard',
  'active',
  false,
  'standard',
  jsonb_build_object('scope', 'global', 'source', 'provider_announcement')
)
on conflict (provider_model_id, variant_key) do update set
  provider_region_id = excluded.provider_region_id,
  execution_region = excluded.execution_region,
  data_region = excluded.data_region,
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  endpoint_label = excluded.endpoint_label,
  metadata = excluded.metadata,
  updated_at = now();
