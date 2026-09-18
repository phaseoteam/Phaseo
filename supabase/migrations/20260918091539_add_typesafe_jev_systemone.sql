-- Introduce TypeSafe's Jev System One model as a structured-evaluation
-- capability. The route is intentionally staged until the managed
-- TYPESAFE_API_KEY secret has been installed and a live probe has passed.

insert into public.v2_labs (
  lab_slug, name, country_code, description, status, routable, metadata
)
values (
  'typesafe',
  'TypeSafe',
  'xx',
  'TypeSafe builds machine-native System One models for typed decisions.',
  'active',
  false,
  jsonb_build_object(
    'source_url', 'https://typesafe.ai/',
    'documentation_url', 'https://docs.typesafe.ai/introduction'
  )
)
on conflict (lab_slug) do update set
  name = excluded.name,
  country_code = excluded.country_code,
  description = excluded.description,
  metadata = public.v2_labs.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_providers (
  provider_slug, lab_slug, name, status, routing_enabled, routable,
  country_code, base_url, metadata, byok_available, credential_mode
)
values (
  'typesafe',
  'typesafe',
  'TypeSafe',
  'not_ready',
  false,
  false,
  'xx',
  'https://api.typesafe.ai',
  jsonb_build_object(
    'source_url', 'https://typesafe.ai/',
    'documentation_url', 'https://docs.typesafe.ai/api',
    'adapter_ready', true,
    'credentials_ready', false,
    'auth_env', 'TYPESAFE_API_KEY',
    'api', jsonb_build_object(
      'endpoint', '/v1/systemone',
      'public_endpoint', '/v1/decisions',
      'format', 'typesafe.systemone'
    )
  ),
  true,
  'managed_and_byok'
)
on conflict (provider_slug) do update set
  lab_slug = excluded.lab_slug,
  name = excluded.name,
  base_url = excluded.base_url,
  metadata = public.v2_providers.metadata || excluded.metadata,
  byok_available = excluded.byok_available,
  credential_mode = excluded.credential_mode,
  updated_at = now();

insert into public.v2_models (
  model_slug, lab_slug, name, description, status, hidden,
  input_modalities, output_modalities, family_slug, metadata
)
values (
  'typesafe/jev',
  'typesafe',
  'Jev 1.13',
  'TypeSafe Jev evaluates typed Noul, Choice, and Score questions against structured state.',
  'active',
  false,
  array['structured']::text[],
  array['decisions']::text[],
  'system-one',
  jsonb_build_object(
    'source_url', 'https://docs.typesafe.ai/models',
    'api_reference', 'https://docs.typesafe.ai/api',
    'provider_model_slug', 'jev-1.13.0',
    'model_version', 'jev-1.13.0',
    'capability', 'decisions.make',
    'legacy_capability', 'systemone',
    'preview', true
  )
)
on conflict (model_slug) do update set
  lab_slug = excluded.lab_slug,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  family_slug = excluded.family_slug,
  metadata = public.v2_models.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_aliases (
  alias_slug, model_slug, alias_type, enabled, metadata
)
values
  (
    'typesafe/jev-latest',
    'typesafe/jev',
    'public',
    true,
    jsonb_build_object('provider_model_slug', 'jev-1.13.0', 'source', 'typesafe')
  ),
  (
    'typesafe/jev-preview',
    'typesafe/jev',
    'public',
    true,
    jsonb_build_object('provider_model_slug', 'jev-1.13.0', 'source', 'typesafe')
  ),
  (
    'typesafe/jev-1.13.0',
    'typesafe/jev',
    'version',
    true,
    jsonb_build_object('provider_model_slug', 'jev-1.13.0', 'source', 'typesafe')
  )
on conflict (alias_slug) do update set
  model_slug = excluded.model_slug,
  alias_type = excluded.alias_type,
  enabled = excluded.enabled,
  metadata = public.v2_model_aliases.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_provider_routes (
  provider_model_id, model_slug, provider_slug, provider_model_slug, status,
  routing_enabled, input_modalities, output_modalities, regions,
  effective_from, metadata, provider_availability_status, phaseo_status,
  access_scope, is_stealth, credential_mode
)
values (
  'typesafe:typesafe/jev:systemone',
  'typesafe/jev',
  'typesafe',
  'jev-1.13.0',
  'active',
  false,
  array['structured']::text[],
  array['decisions']::text[],
  array['global']::text[],
  '2026-09-17T00:00:00Z'::timestamptz,
  jsonb_build_object(
    'source', 'admin',
    'source_url', 'https://docs.typesafe.ai/api',
    'api', jsonb_build_object(
      'endpoint', '/v1/systemone',
      'public_endpoint', '/v1/decisions',
      'format', 'typesafe.systemone'
    ),
    'verification', jsonb_build_object(
      'status', 'catalogue_verified',
      'checked_at', '2026-09-17T00:00:00Z'::timestamptz,
      'notes', 'The adapter is implemented, but the managed credential and live request probe are still pending.'
    )
  ),
  'coming_soon',
  'testing',
  'internal',
  false,
  'managed_and_byok'
)
on conflict (provider_model_id) do update set
  model_slug = excluded.model_slug,
  provider_slug = excluded.provider_slug,
  provider_model_slug = excluded.provider_model_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  regions = excluded.regions,
  effective_from = excluded.effective_from,
  metadata = public.v2_model_provider_routes.metadata || excluded.metadata,
  provider_availability_status = excluded.provider_availability_status,
  phaseo_status = excluded.phaseo_status,
  access_scope = excluded.access_scope,
  is_stealth = excluded.is_stealth,
  credential_mode = excluded.credential_mode,
  updated_at = now();

insert into public.v2_route_variants (
  provider_model_id, variant_key, service_tier_slug, status,
  routing_enabled, endpoint_label, metadata
)
values (
  'typesafe:typesafe/jev:systemone',
  'global:standard',
  'standard',
  'disabled',
  false,
  'Standard',
  jsonb_build_object('source', 'admin', 'preview', true)
)
on conflict (provider_model_id, variant_key) do update set
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  endpoint_label = excluded.endpoint_label,
  metadata = public.v2_route_variants.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_route_capabilities (
  provider_model_id, capability_id, status, params, effective_from, metadata
)
values (
  'typesafe:typesafe/jev:systemone',
  'decisions.make',
  'internal_testing',
  jsonb_build_object('model', true, 'state', true, 'questions', true),
  '2026-09-17T00:00:00Z'::timestamptz,
  jsonb_build_object(
    'source', 'admin',
    'capability_evidence', jsonb_build_object(
      'status', 'documented',
      'source_url', 'https://docs.typesafe.ai/api',
      'question_types', jsonb_build_array('noul', 'choice', 'score')
    )
  )
)
on conflict (provider_model_id, capability_id) do update set
  status = excluded.status,
  params = excluded.params,
  effective_from = excluded.effective_from,
  metadata = public.v2_route_capabilities.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_meter_definitions (
  meter_key, display_name, modality, direction, unit,
  default_unit_quantity, description, status, metadata
)
values
  (
    'input_tokens',
    'Input tokens',
    'text',
    'input',
    'token',
    1000000,
    'Tokens sent to TypeSafe System One.',
    'active',
    jsonb_build_object('source', 'typesafe')
  ),
  (
    'output_tokens',
    'Output tokens',
    'text',
    'output',
    'token',
    1000000,
    'TypeSafe reports output tokens as free.',
    'active',
    jsonb_build_object('source', 'typesafe')
  )
on conflict (meter_key) do nothing;

insert into public.v2_pricing_skus (
  provider_model_id, sku_code, version, operation, status, service_tier_slug,
  display_name, description, currency, effective_from, route_variant_id,
  metadata
)
values (
  'typesafe:typesafe/jev:systemone',
  'typesafe-jev-systemone',
  1,
  'decisions.make',
  'active',
  'standard',
  'Jev 1.13',
  '$0.042 per million input tokens. TypeSafe reports output as free.',
  'USD',
  '2026-09-17T00:00:00Z'::timestamptz,
  (
    select variant_id
    from public.v2_route_variants
    where provider_model_id = 'typesafe:typesafe/jev:systemone'
      and variant_key = 'global:standard'
  ),
  jsonb_build_object(
    'source_url', 'https://docs.typesafe.ai/models',
    'pricing_basis', 'TypeSafe published Jev pricing',
    'preview', true
  )
)
on conflict (provider_model_id, sku_code, version) do update set
  operation = excluded.operation,
  status = excluded.status,
  service_tier_slug = excluded.service_tier_slug,
  display_name = excluded.display_name,
  description = excluded.description,
  currency = excluded.currency,
  effective_from = excluded.effective_from,
  route_variant_id = excluded.route_variant_id,
  metadata = public.v2_pricing_skus.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_pricing_sku_meters (
  sku_id, meter_key, modality, direction, unit, unit_quantity,
  price_nanos, display_label, display_unit, billable, meter_order, metadata
)
select
  sku.sku_id,
  meter.meter_key,
  meter.modality,
  meter.direction,
  meter.unit,
  meter.unit_quantity,
  meter.price_nanos,
  meter.display_label,
  meter.display_unit,
  meter.billable,
  meter.meter_order,
  meter.metadata
from public.v2_pricing_skus sku
cross join (
  values
    (
      'input_tokens', 'text', 'input', 'token', 1000000::numeric,
      42000000::numeric, 'Input tokens', '1M tokens', true, 100,
      jsonb_build_object('source', 'typesafe', 'price_per_million_usd', 0.042, 'published_price_per_billion_usd', 42)
    ),
    (
      'output_tokens', 'text', 'output', 'token', 1000000::numeric,
      0::numeric, 'Output tokens', '1M tokens', true, 110,
      jsonb_build_object('source', 'typesafe', 'price_per_million_usd', 0, 'published_price_per_billion_usd', 0)
    )
) as meter(
  meter_key, modality, direction, unit, unit_quantity, price_nanos,
  display_label, display_unit, billable, meter_order, metadata
)
where sku.provider_model_id = 'typesafe:typesafe/jev:systemone'
  and sku.sku_code = 'typesafe-jev-systemone'
  and sku.version = 1
on conflict (sku_id, meter_key) do update set
  modality = excluded.modality,
  direction = excluded.direction,
  unit = excluded.unit,
  unit_quantity = excluded.unit_quantity,
  price_nanos = excluded.price_nanos,
  display_label = excluded.display_label,
  display_unit = excluded.display_unit,
  billable = excluded.billable,
  meter_order = excluded.meter_order,
  metadata = public.v2_pricing_sku_meters.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_links (model_slug, link_kind, title, url, metadata)
values
  (
    'typesafe/jev',
    'documentation',
    'TypeSafe API reference',
    'https://docs.typesafe.ai/api',
    jsonb_build_object('source', 'typesafe')
  ),
  (
    'typesafe/jev',
    'provider',
    'TypeSafe',
    'https://typesafe.ai/',
    jsonb_build_object('source', 'typesafe')
  )
on conflict (model_slug, link_kind, url) do update set
  title = excluded.title,
  metadata = public.v2_model_links.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_page_notices (model_slug, tone, markdown)
values (
  'typesafe/jev',
  'info',
  'Jev is a structured decision model. Use the Decisions playground or the `/v1/decisions` endpoint with typed Noul, Choice, and Score questions. The route remains in preview until the managed TypeSafe credential is installed.'
)
on conflict (model_slug) do update set
  tone = excluded.tone,
  markdown = excluded.markdown,
  updated_at = now();
