-- Union Alpha remains a stealth model identity, but its OpenRouter route is a
-- public provider route. Keep the route explicit so a fresh environment does
-- not depend on the manually verified production row. Do not change the
-- provider-wide visibility flags here: the route below is the only OpenRouter
-- route this migration enables.

insert into public.v2_model_provider_routes (
  provider_model_id,
  model_slug,
  provider_slug,
  provider_model_slug,
  status,
  routing_enabled,
  input_modalities,
  output_modalities,
  regions,
  context_length,
  max_output_tokens,
  effective_from,
  effective_to,
  metadata,
  provider_availability_status,
  phaseo_status,
  access_scope,
  is_stealth,
  credential_mode
)
values (
  'stealth:stealth/union-alpha:openrouter',
  'stealth/union-alpha',
  'openrouter',
  'stealth/union-alpha',
  'active',
  true,
  array['text', 'image']::text[],
  array['text']::text[],
  array['global']::text[],
  262144,
  131072,
  '2026-09-16T14:42:03Z'::timestamptz,
  null,
  jsonb_build_object(
    'api', jsonb_build_object(
      'formats', jsonb_build_array('openai.chat.completions'),
      'endpoint', '/chat/completions',
      'deployment', null
    ),
    'source', 'admin',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'url', 'https://openrouter.ai/api/v1/models/stealth/union-alpha/endpoints',
        'kind', 'provider_model_endpoint',
        'accessed_at', '2026-09-16T17:09:52Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://opencode.ai/es/data/unknown/union-alpha',
        'kind', 'usage_catalogue',
        'accessed_at', '2026-09-16T17:09:52Z'::timestamptz
      )
    ),
    'support', jsonb_build_object(
      'opencode', jsonb_build_object(
        'status', 'observed',
        'model_id', 'union-alpha'
      ),
      'openrouter', jsonb_build_object(
        'status', 'available',
        'endpoint_count', 1,
        'provider_model_slug', 'stealth/union-alpha'
      )
    ),
    'routable', true,
    'source_key', 'openrouter:stealth/union-alpha',
    'verification', jsonb_build_object(
      'notes', 'OpenRouter direct Chat Completions executor live-verified with a non-expiring managed key; Cloudflare is not used for this route.',
      'status', 'verified',
      'checked_at', '2026-09-16T19:53:15Z'::timestamptz
    ),
    'routing_status', 'enabled'
  ),
  'available',
  'enabled',
  'public',
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
  context_length = excluded.context_length,
  max_output_tokens = excluded.max_output_tokens,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  metadata = excluded.metadata,
  provider_availability_status = excluded.provider_availability_status,
  phaseo_status = excluded.phaseo_status,
  access_scope = excluded.access_scope,
  is_stealth = excluded.is_stealth,
  credential_mode = excluded.credential_mode,
  updated_at = now();

insert into public.v2_route_variants (
  provider_model_id,
  variant_key,
  service_tier_slug,
  status,
  routing_enabled,
  endpoint_label,
  metadata
)
values (
  'stealth:stealth/union-alpha:openrouter',
  'global:standard',
  'standard',
  'active',
  true,
  'standard',
  jsonb_build_object(
    'scope', 'global',
    'source', 'admin'
  )
)
on conflict (provider_model_id, variant_key) do update set
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  endpoint_label = excluded.endpoint_label,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.v2_route_capabilities (
  provider_model_id,
  capability_id,
  status,
  max_input_tokens,
  max_output_tokens,
  params,
  effective_from,
  effective_to,
  metadata
)
values (
  'stealth:stealth/union-alpha:openrouter',
  'text.generate',
  'active',
  null,
  131072,
  jsonb_build_array(
    'max_tokens',
    'temperature',
    'top_p',
    'tools',
    'tool_choice',
    'response_format'
  ),
  '2026-09-16T14:42:03Z'::timestamptz,
  null,
  jsonb_build_object(
    'source', 'admin',
    'capability_evidence', jsonb_build_object(
      'params', jsonb_build_array(
        'max_tokens',
        'temperature',
        'top_p',
        'tools',
        'tool_choice',
        'response_format'
      ),
      'status', 'active',
      'reasoning', null,
      'tool_call', true,
      'attachment', true,
      'temperature', true,
      'capability_id', 'text.generate',
      'input_modalities', jsonb_build_array('text', 'image'),
      'output_modalities', jsonb_build_array('text'),
      'structured_output', true
    )
  )
)
on conflict (provider_model_id, capability_id) do update set
  status = excluded.status,
  max_input_tokens = excluded.max_input_tokens,
  max_output_tokens = excluded.max_output_tokens,
  params = excluded.params,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.v2_pricing_skus (
  provider_model_id,
  sku_code,
  version,
  operation,
  status,
  service_tier_slug,
  display_name,
  description,
  currency,
  effective_from,
  effective_to,
  route_variant_id,
  metadata
)
values (
  'stealth:stealth/union-alpha:openrouter',
  'offer-stealth-union-alpha-preview',
  1,
  'text.generate',
  'active',
  'standard',
  'preview text.generate',
  'OpenRouter currently reports zero input and output price during the Union Alpha preview.',
  'USD',
  '2026-09-16T14:42:03Z'::timestamptz,
  null,
  (
    select variant_id
    from public.v2_route_variants
    where provider_model_id = 'stealth:stealth/union-alpha:openrouter'
      and variant_key = 'global:standard'
  ),
  jsonb_build_object(
    'source', 'admin',
    'source_key', 'openrouter:stealth/union-alpha:text.generate:preview',
    'accessed_at', '2026-09-16T17:09:52Z'::timestamptz,
    'pricing_basis', 'OpenRouter endpoint catalogue'
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
  effective_to = excluded.effective_to,
  route_variant_id = excluded.route_variant_id,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.v2_pricing_sku_meters (
  sku_id,
  meter_key,
  modality,
  direction,
  unit,
  unit_quantity,
  price_nanos,
  display_label,
  display_unit,
  billable,
  meter_order,
  metadata
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
    ('input_text_tokens', 'text', 'input', 'token', 1000000::numeric, 0::numeric, 'input_text_tokens', '1000000 token', true, 100, jsonb_build_object('source', 'admin', 'provider', 'openrouter')),
    ('output_text_tokens', 'text', 'output', 'token', 1000000::numeric, 0::numeric, 'output_text_tokens', '1000000 token', true, 100, jsonb_build_object('source', 'admin', 'provider', 'openrouter'))
) as meter(meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, billable, meter_order, metadata)
where sku.provider_model_id = 'stealth:stealth/union-alpha:openrouter'
  and sku.sku_code = 'offer-stealth-union-alpha-preview'
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
  metadata = excluded.metadata,
  updated_at = now();
