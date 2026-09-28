-- Prepare the Sonnet 5.5 release using Sonnet 5's existing provider coverage.
-- The same DML was applied directly to Phaseo Prod on September 28, 2026.
-- This idempotent migration records the change in repository history. Prices
-- inherit Sonnet 5 and remain provisional until officially verified.

insert into public.v2_models (
  model_slug, lab_slug, name, description, status, hidden,
  input_modalities, output_modalities, family_slug, announced_at, released_at,
  metadata, catalogue_status
)
values (
  'anthropic/claude-sonnet-5.5', 'anthropic', 'Claude Sonnet 5.5',
  'Claude Sonnet 5.5 is a Sonnet model in Anthropic''s Claude 5.5 family.',
  'active', false, array['text', 'image']::text[], array['text']::text[],
  'anthropic/claude-5', '2026-09-22T00:00:00Z'::timestamptz,
  '2026-09-28T00:00:00Z'::timestamptz,
  jsonb_build_object(
    'source', 'release_migration',
    'source_url', 'https://www.anthropic.com/claude-opus-5-5',
    'previous_model_slug', 'anthropic/claude-sonnet-5',
    'limits', jsonb_build_object('context', 1000000, 'input', 1000000, 'output', 128000),
    'verification', jsonb_build_object(
      'status', 'partial',
      'checked_at', '2026-09-28T00:00:00Z',
      'notes', 'Anthropic confirmed Sonnet 5.5 as forthcoming on September 22. The September 28 availability, model specifications, and prices are provisional pending official launch confirmation.'
    )
  ),
  'available'
)
on conflict (model_slug) do nothing;

insert into public.v2_model_provider_routes (
  provider_model_id, model_slug, provider_slug, provider_model_slug, status,
  routing_enabled, input_modalities, output_modalities, regions,
  context_length, max_output_tokens, effective_from, metadata,
  provider_availability_status, phaseo_status, access_scope, is_stealth,
  credential_mode
)
select
  replace(route.provider_model_id, 'claude-sonnet-5', 'claude-sonnet-5.5'),
  'anthropic/claude-sonnet-5.5', route.provider_slug,
  replace(route.provider_model_slug, 'claude-sonnet-5', 'claude-sonnet-5-5'),
  'active', true, route.input_modalities, route.output_modalities, route.regions,
  1000000, 128000, '2026-09-28T00:00:00Z'::timestamptz,
  (route.metadata - 'sources' - 'verification' - 'source_url') || jsonb_build_object(
    'source', 'release_migration',
    'routable', true,
    'routing_status', 'active',
    'verification', jsonb_build_object(
      'status', 'unverified',
      'notes', 'Route is configured and enabled in Phaseo. Provider model ID, upstream availability, and live inference remain unverified.'
    )
  ),
  'available', 'enabled', route.access_scope, route.is_stealth,
  route.credential_mode
from public.v2_model_provider_routes route
where route.model_slug = 'anthropic/claude-sonnet-5'
  and route.provider_slug = any (array[
    'anthropic', 'anthropic-us', 'anthropic-aws', 'anthropic-aws-us',
    'amazon-bedrock', 'google-vertex', 'google-vertex-eu'
  ])
  and route.status = 'active'
  and route.routing_enabled = true
on conflict (provider_model_id) do nothing;

insert into public.v2_route_variants (
  provider_model_id, variant_key, provider_region_id, execution_region,
  data_region, service_tier_slug, status, routing_enabled, endpoint_label,
  metadata
)
select
  next_route.provider_model_id, variant.variant_key, variant.provider_region_id,
  variant.execution_region, variant.data_region, variant.service_tier_slug,
  'active', true, variant.endpoint_label,
  variant.metadata || jsonb_build_object('source', 'release_migration')
from public.v2_route_variants variant
join public.v2_model_provider_routes old_route
  on old_route.provider_model_id = variant.provider_model_id
join public.v2_model_provider_routes next_route
  on next_route.provider_model_id = replace(old_route.provider_model_id, 'claude-sonnet-5', 'claude-sonnet-5.5')
where old_route.model_slug = 'anthropic/claude-sonnet-5'
  and variant.status = 'active'
  and variant.routing_enabled = true
on conflict (provider_model_id, variant_key) do nothing;

insert into public.v2_route_capabilities (
  provider_model_id, capability_id, status, max_input_tokens,
  max_output_tokens, params, effective_from, metadata
)
select
  next_route.provider_model_id, capability.capability_id, 'active',
  capability.max_input_tokens, capability.max_output_tokens,
  capability.params, '2026-09-28T00:00:00Z'::timestamptz,
  (capability.metadata - 'capability_evidence') || jsonb_build_object(
    'source', 'release_migration',
    'verification', 'Requires live provider smoke check before publication.'
  )
from public.v2_route_capabilities capability
join public.v2_model_provider_routes old_route
  on old_route.provider_model_id = capability.provider_model_id
join public.v2_model_provider_routes next_route
  on next_route.provider_model_id = replace(old_route.provider_model_id, 'claude-sonnet-5', 'claude-sonnet-5.5')
where old_route.model_slug = 'anthropic/claude-sonnet-5'
  and capability.capability_id = 'text.generate'
  and capability.status = 'active'
on conflict (provider_model_id, capability_id) do nothing;

insert into public.v2_pricing_skus (
  provider_model_id, sku_code, version, operation, status, region,
  display_name, description, currency, effective_from, metadata,
  service_tier_slug, route_variant_id
)
select
  next_route.provider_model_id,
  replace(sku.sku_code, 'sonnet-5', 'sonnet-5.5'),
  sku.version, sku.operation, 'active', sku.region,
  replace(sku.display_name, 'Sonnet 5', 'Sonnet 5.5'),
  'Provisional Sonnet 5.5 pricing inherited from Sonnet 5; verify provider-specific rates before applying.',
  sku.currency, '2026-09-28T00:00:00Z'::timestamptz,
  (sku.metadata - 'source_url' - 'verification') || jsonb_build_object(
    'source', 'release_migration',
    'pricing_status', 'provisional'
  ),
  sku.service_tier_slug, next_variant.variant_id
from public.v2_pricing_skus sku
join public.v2_model_provider_routes old_route
  on old_route.provider_model_id = sku.provider_model_id
join public.v2_model_provider_routes next_route
  on next_route.provider_model_id = replace(old_route.provider_model_id, 'claude-sonnet-5', 'claude-sonnet-5.5')
left join public.v2_route_variants old_variant
  on old_variant.variant_id = sku.route_variant_id
left join public.v2_route_variants next_variant
  on next_variant.provider_model_id = next_route.provider_model_id
 and next_variant.variant_key = old_variant.variant_key
where old_route.model_slug = 'anthropic/claude-sonnet-5'
  and sku.status = 'active'
  and sku.effective_to is null
on conflict (provider_model_id, sku_code, version) do nothing;

insert into public.v2_pricing_sku_meters (
  sku_id, meter_key, modality, direction, unit, unit_quantity, price_nanos,
  display_label, display_unit, billable, meter_order, metadata
)
select
  next_sku.sku_id, meter.meter_key, meter.modality, meter.direction,
  meter.unit, meter.unit_quantity, meter.price_nanos, meter.display_label,
  meter.display_unit, meter.billable, meter.meter_order,
  (meter.metadata - 'source_url') || jsonb_build_object(
    'source', 'release_migration',
    'pricing_status', 'provisional'
  )
from public.v2_pricing_sku_meters meter
join public.v2_pricing_skus old_sku on old_sku.sku_id = meter.sku_id
join public.v2_model_provider_routes old_route
  on old_route.provider_model_id = old_sku.provider_model_id
join public.v2_pricing_skus next_sku
  on next_sku.provider_model_id = replace(old_sku.provider_model_id, 'claude-sonnet-5', 'claude-sonnet-5.5')
 and next_sku.sku_code = replace(old_sku.sku_code, 'sonnet-5', 'sonnet-5.5')
 and next_sku.version = old_sku.version
where old_route.model_slug = 'anthropic/claude-sonnet-5'
  and old_sku.status = 'active'
  and old_sku.effective_to is null
on conflict (sku_id, meter_key) do nothing;

insert into public.v2_model_aliases (alias_slug, model_slug, alias_type, enabled, metadata)
values (
  'anthropic/claude-sonnet-latest', 'anthropic/claude-sonnet-5.5',
  'public', true, jsonb_build_object('source', 'release_migration')
)
on conflict (alias_slug) do update set
  model_slug = excluded.model_slug,
  enabled = true,
  metadata = public.v2_model_aliases.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_page_notices (model_slug, tone, markdown)
values (
  'anthropic/claude-sonnet-5.5', 'info',
  'Provider availability and pricing are pending official launch confirmation.'
)
on conflict (model_slug) do update set
  tone = excluded.tone,
  markdown = excluded.markdown,
  updated_at = now();

do $$
declare
  route_count integer;
  complete_route_count integer;
begin
  select count(*), count(*) filter (
    where exists (
      select 1 from public.v2_route_capabilities capability
      where capability.provider_model_id = route.provider_model_id
        and capability.capability_id = 'text.generate'
        and capability.status = 'active'
    )
    and exists (
      select 1 from public.v2_route_variants variant
      where variant.provider_model_id = route.provider_model_id
        and variant.status = 'active'
        and variant.routing_enabled
    )
    and exists (
      select 1 from public.v2_pricing_skus sku
      where sku.provider_model_id = route.provider_model_id
        and sku.status = 'active'
        and exists (
          select 1 from public.v2_pricing_sku_meters meter
          where meter.sku_id = sku.sku_id
        )
    )
  )
  into route_count, complete_route_count
  from public.v2_model_provider_routes route
  where route.model_slug = 'anthropic/claude-sonnet-5.5'
    and route.provider_slug = any (array[
      'anthropic', 'anthropic-us', 'anthropic-aws', 'anthropic-aws-us',
      'amazon-bedrock', 'google-vertex', 'google-vertex-eu'
    ])
    and route.status = 'active'
    and route.routing_enabled;

  if route_count <> 7 or complete_route_count <> 7 then
    raise exception 'Sonnet 5.5 release incomplete: % active routes, % with capability, variant, and pricing',
      route_count, complete_route_count;
  end if;
end $$;
