-- Union Alpha is listed in Cloudflare's unified model catalogue as a
-- third-party text/vision model. Keep the route database-owned so the
-- protected stealth catalogue rows are not imported from public JSON.

insert into public.v2_models (
  model_slug,
  lab_slug,
  name,
  description,
  status,
  hidden,
  input_modalities,
  output_modalities,
  family_slug,
  announced_at,
  released_at,
  deprecated_at,
  retired_at,
  metadata,
  catalogue_status
)
values (
  'stealth/union-alpha',
  'stealth',
  'Union Alpha',
  'Union Alpha is an anonymous multimodal model for research, coding, agentic workflows, and general-purpose tasks.',
  'active',
  false,
  array['text', 'image']::text[],
  array['text']::text[],
  null,
  '2026-09-16T00:00:00Z'::timestamptz,
  '2026-09-16T14:42:03Z'::timestamptz,
  null,
  null,
  jsonb_build_object(
    'limits', jsonb_build_object('input', null, 'output', 131072, 'context', 262144),
    'source', 'admin',
    'source_key', 'stealth/union-alpha',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'url', 'https://openrouter.ai/api/v1/models',
        'kind', 'provider_models',
        'notes', 'Live model catalogue entry for stealth/union-alpha.',
        'accessed_at', '2026-09-16T17:09:52Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://openrouter.ai/api/v1/models/stealth/union-alpha/endpoints',
        'kind', 'provider_model_endpoint',
        'notes', 'Authenticated read-only probe returned one Stealth endpoint and the published limits, parameters, and zero preview pricing.',
        'accessed_at', '2026-09-16T17:09:52Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://openrouter.ai/stealth/union-alpha',
        'kind', 'provider_catalogue',
        'notes', 'OpenRouter model page.',
        'accessed_at', '2026-09-16T17:09:52Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://opencode.ai/es/data/unknown/union-alpha',
        'kind', 'usage_catalogue',
        'notes', 'OpenCode Data page records usage for union-alpha; this is client usage evidence, not a provider endpoint.',
        'accessed_at', '2026-09-16T17:09:52Z'::timestamptz
      )
    ),
    'support', jsonb_build_object(
      'opencode', jsonb_build_object(
        'note', 'OpenCode usage data confirms the model label; OpenCode is not recorded as a provider route.',
        'status', 'observed',
        'model_id', 'union-alpha'
      ),
      'openrouter', jsonb_build_object(
        'status', 'available',
        'pricing', jsonb_build_object('prompt_per_million_usd', 0, 'completion_per_million_usd', 0),
        'model_id', 'stealth/union-alpha',
        'provider', 'Stealth',
        'endpoint_count', 1
      ),
      'cloudflare', jsonb_build_object(
        'status', 'available',
        'model_id', 'stealth/union-alpha',
        'endpoint', '/ai/v1/chat/completions',
        'deployment', 'cloudflare_unified'
      )
    ),
    'modalities', jsonb_build_object(
      'input', jsonb_build_array('text', 'image'),
      'output', jsonb_build_array('text')
    ),
    'model_type', 'language',
    'capabilities', jsonb_build_object(
      'reasoning', null,
      'streaming', true,
      'tool_call', true,
      'attachment', true,
      'web_search', null,
      'temperature', true,
      'structured_output', true
    ),
    'verification', jsonb_build_object(
      'notes', 'OpenRouter and Cloudflare Unified AI access are verified; the underlying lab identity remains unverified.',
      'status', 'partial',
      'checked_at', '2026-09-16T17:09:52Z'::timestamptz
    )
  ),
  'available'
)
on conflict (model_slug) do update set
  lab_slug = excluded.lab_slug,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  hidden = excluded.hidden,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  family_slug = excluded.family_slug,
  announced_at = excluded.announced_at,
  released_at = excluded.released_at,
  deprecated_at = excluded.deprecated_at,
  retired_at = excluded.retired_at,
  metadata = excluded.metadata,
  catalogue_status = excluded.catalogue_status,
  updated_at = now();

update public.v2_models
set announced_at = '2026-09-16T00:00:00Z'::timestamptz,
    updated_at = now()
where model_slug = 'stealth/union-alpha'
  and status = 'active'
  and hidden = false;

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
  access_scope
)
values (
  'stealth:stealth/union-alpha:cloudflare',
  'stealth/union-alpha',
  'cloudflare',
  'stealth/union-alpha',
  'active',
  true,
  array['text', 'image']::text[],
  array['text']::text[],
  array['global']::text[],
  null,
  null,
  '2026-09-16T00:00:00Z'::timestamptz,
  null,
  jsonb_build_object(
    'source', 'admin',
    'source_key', 'cloudflare:stealth/union-alpha',
    'sources', jsonb_build_array(
      jsonb_build_object(
        'url', 'https://developers.cloudflare.com/ai/models/stealth/union-alpha/',
        'kind', 'provider_model_page',
        'accessed_at', '2026-09-16T00:00:00Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://developers.cloudflare.com/ai-gateway/usage/rest-api/',
        'kind', 'provider_api_docs',
        'accessed_at', '2026-09-16T00:00:00Z'::timestamptz
      )
    ),
    'api', jsonb_build_object(
      'formats', jsonb_build_array('openai.chat.completions'),
      'endpoint', '/ai/v1/chat/completions',
      'deployment', 'cloudflare_unified'
    ),
    'support', jsonb_build_object(
      'cloudflare', jsonb_build_object(
        'status', 'available',
        'provider_model_slug', 'stealth/union-alpha',
        'model_page', 'https://developers.cloudflare.com/ai/models/stealth/union-alpha/'
      )
    ),
    'verification', jsonb_build_object(
      'status', 'catalogue_verified',
      'checked_at', '2026-09-16T00:00:00Z'::timestamptz,
      'notes', 'Cloudflare lists Union Alpha as a third-party model and documents the unified AI chat-completions endpoint. Account access requires gateway balance or BYOK.'
    ),
    'routing_status', 'enabled',
    'routable', true
  ),
  'available',
  'enabled',
  'public'
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
  'stealth:stealth/union-alpha:cloudflare',
  'global:standard',
  'standard',
  'active',
  true,
  'Standard',
  jsonb_build_object(
    'source', 'admin',
    'provider', 'cloudflare',
    'deployment', 'cloudflare_unified'
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
  'stealth:stealth/union-alpha:cloudflare',
  'text.generate',
  'active',
  null,
  null,
  '["max_tokens","max_completion_tokens","temperature","top_p","frequency_penalty","presence_penalty","stream","tools","tool_choice","response_format","modalities","audio","reasoning_effort"]'::jsonb,
  '2026-09-16T00:00:00Z'::timestamptz,
  null,
  jsonb_build_object(
    'source', 'admin',
    'capability_evidence', jsonb_build_object(
      'status', 'available',
      'source_url', 'https://developers.cloudflare.com/ai/models/stealth/union-alpha/',
      'notes', 'Cloudflare documents text and vision inputs plus chat-completions parameters for this model.'
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
  'stealth:stealth/union-alpha:cloudflare',
  'offer-stealth-union-alpha-preview-cloudflare',
  1,
  'text.generate',
  'active',
  'standard',
  'Union Alpha Preview',
  'Cloudflare Unified AI route; Cloudflare gateway balance or BYOK may be required.',
  'USD',
  '2026-09-16T00:00:00Z'::timestamptz,
  null,
  (
    select variant_id
    from public.v2_route_variants
    where provider_model_id = 'stealth:stealth/union-alpha:cloudflare'
      and variant_key = 'global:standard'
  ),
  jsonb_build_object(
    'source', 'admin',
    'provider', 'cloudflare',
    'pricing_basis', 'Cloudflare unified model example reports usage cost 0',
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
    ('input_text_tokens', 'text', 'input', 'token', 1000000::numeric, 0::numeric, 'input_text_tokens', '1000000 token', true, 100, jsonb_build_object('source', 'admin', 'provider', 'cloudflare')),
    ('output_text_tokens', 'text', 'output', 'token', 1000000::numeric, 0::numeric, 'output_text_tokens', '1000000 token', true, 100, jsonb_build_object('source', 'admin', 'provider', 'cloudflare'))
) as meter(meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, billable, meter_order, metadata)
where sku.provider_model_id = 'stealth:stealth/union-alpha:cloudflare'
  and sku.sku_code = 'offer-stealth-union-alpha-preview-cloudflare'
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

insert into public.v2_model_page_notices (model_slug, tone, markdown)
values (
  'stealth/union-alpha',
  'info',
  'This model is supported through OpenRouter and Cloudflare AI. Requests can route directly through OpenRouter or via Cloudflare''s Unified AI API; Cloudflare requests require an eligible Cloudflare gateway balance or BYOK configuration.'
)
on conflict (model_slug) do update set
  tone = excluded.tone,
  markdown = excluded.markdown,
  updated_at = now();
