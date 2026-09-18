-- Keep Unbiased's direct Pareto identity visible in the catalogue without
-- implying that Phaseo has an executable provider route.

insert into public.v2_labs (
  lab_slug,
  name,
  country_code,
  description,
  status,
  routable,
  metadata
)
values (
  'unbiased',
  'Unbiased',
  'xx',
  'Unbiased publishes Pareto, a blended model operated by Circuit & Chisel.',
  'active',
  false,
  jsonb_build_object(
    'source', 'admin',
    'logo_url', 'https://unbiased.ai/assets/logo-icon.svg',
    'logo_icon_url', 'https://unbiased.ai/assets/logo-icon.svg',
    'logo_wordmark_url', 'https://unbiased.ai/assets/logo-wordmark.svg',
    'website_url', 'https://unbiased.ai/',
    'access', jsonb_build_object(
      'status', 'limited_access',
      'approval_required', true,
      'endpoint_public', false
    ),
    'sources', jsonb_build_array(
      jsonb_build_object(
        'url', 'https://unbiased.ai/',
        'kind', 'official_website',
        'accessed_at', '2026-09-18T00:00:00Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://unbiased.ai/model-card/',
        'kind', 'official_model_card',
        'accessed_at', '2026-09-18T00:00:00Z'::timestamptz
      )
    )
  )
)
on conflict (lab_slug) do update set
  name = excluded.name,
  country_code = excluded.country_code,
  description = excluded.description,
  status = excluded.status,
  routable = false,
  metadata = public.v2_labs.metadata || excluded.metadata,
  updated_at = now();

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
  metadata,
  license,
  catalogue_status
)
values (
  'unbiased/pareto',
  'unbiased',
  'Pareto 26.9',
  'Pareto 26.9 is Unbiased''s multimodal blended model, built and maintained by Circuit & Chisel. It combines multiple frontier and open models in parallel and synthesizes one response. This record is catalogue-only: direct Unbiased access is limited/approval-only and Phaseo has no executable provider route.',
  'active',
  false,
  array['text', 'image']::text[],
  array['text']::text[],
  'pareto',
  '2026-09-17T00:00:00Z'::timestamptz,
  '2026-09-17T00:00:00Z'::timestamptz,
  jsonb_build_object(
    'source', 'admin',
    'operator', 'Circuit & Chisel Inc.',
    'publisher', 'Unbiased',
    'direct_api_model_id', 'pareto',
    'legacy_model_id', 'unbiased/pareto',
    'legacy_api_model_id', 'pareto',
    'platform_model_slug', 'pareto-26.9',
    'identity_kind', 'blended_model',
    'is_router', false,
    'access', jsonb_build_object(
      'status', 'limited_access',
      'approval_required', true,
      'endpoint_public', false
    ),
    'limits', jsonb_build_object('context', 262144),
    'pricing', jsonb_build_object(
      'currency', 'USD',
      'input_per_million', 2.5,
      'cached_input_per_million', 0.25,
      'output_per_million', 7.5
    ),
    'routing', jsonb_build_object(
      'phaseo_route_status', 'planned',
      'provider_route_added', true,
      'provider_route_enabled', false,
      'openrouter_provider_added', false
    ),
    'sources', jsonb_build_array(
      jsonb_build_object(
        'url', 'https://unbiased.ai/model-card/',
        'kind', 'official_model_card',
        'notes', 'Official Pareto identity, direct model identifier pareto, modalities, and published token pricing.',
        'accessed_at', '2026-09-18T00:00:00Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://unbiased.ai/pricing/',
        'kind', 'official_pricing',
        'notes', 'Official input, cached-input, and output prices.',
        'accessed_at', '2026-09-18T00:00:00Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://unbiased.ai/',
        'kind', 'official_website',
        'notes', 'Official description of Pareto as Unbiased''s own blended model.',
        'accessed_at', '2026-09-18T00:00:00Z'::timestamptz
      ),
      jsonb_build_object(
        'url', 'https://developers.cloudflare.com/ai/models/unbiased/pareto/',
        'kind', 'documentation',
        'notes', 'Official documentation bridges unbiased/pareto to the historical union-alpha response identity and lists the 262K context.',
        'accessed_at', '2026-09-18T00:00:00Z'::timestamptz
      )
    ),
    'revealed_from', jsonb_build_object(
      'alias', 'Union Alpha',
      'model_slug', 'stealth/union-alpha',
      'evidence', 'Cloudflare documents unbiased/pareto returning model union-alpha; Unbiased identifies the direct model as pareto.'
    ),
    'verification', jsonb_build_object(
      'status', 'partial',
      'checked_at', '2026-09-18T00:00:00Z'::timestamptz,
      'notes', 'Official Unbiased sources verify the Pareto 26.9 identity, blended-model architecture, modalities, and pricing. Endpoint details are supplied after approval; Phaseo has no endpoint credentials or enabled route.'
    )
  ),
  'Proprietary',
  'limited_access'
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
  metadata = public.v2_models.metadata || excluded.metadata,
  license = excluded.license,
  catalogue_status = excluded.catalogue_status,
  updated_at = now();

insert into public.v2_model_links (model_slug, link_kind, title, url, metadata)
values
  ('unbiased/pareto', 'official_model_card', 'Unbiased model card', 'https://unbiased.ai/model-card/', jsonb_build_object('source', 'admin')),
  ('unbiased/pareto', 'official_pricing', 'Unbiased pricing', 'https://unbiased.ai/pricing/', jsonb_build_object('source', 'admin')),
  ('unbiased/pareto', 'official_website', 'Unbiased', 'https://unbiased.ai/', jsonb_build_object('source', 'admin')),
  ('unbiased/pareto', 'documentation', 'Cloudflare Pareto documentation', 'https://developers.cloudflare.com/ai/models/unbiased/pareto/', jsonb_build_object('source', 'admin'))
on conflict (model_slug, link_kind, url) do update set
  title = excluded.title,
  metadata = public.v2_model_links.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_details (model_slug, detail_name, detail_value, detail_order)
values
  ('unbiased/pareto', 'input_context_length', '262144'::jsonb, 100),
  ('unbiased/pareto', 'license', '"Proprietary"'::jsonb, 110)
on conflict (model_slug, detail_name) do update set
  detail_value = excluded.detail_value,
  detail_order = excluded.detail_order,
  updated_at = now();

insert into public.v2_model_page_notices (model_slug, tone, markdown)
values (
  'unbiased/pareto',
  'info',
  'Unbiased direct access is limited and approval-only. Phaseo lists the Unbiased mapping as Coming Soon for catalogue and pricing visibility; no Phaseo route is enabled.'
)
on conflict (model_slug) do update set
  tone = excluded.tone,
  markdown = excluded.markdown,
  updated_at = now();

insert into public.v2_providers (
  provider_slug,
  lab_slug,
  name,
  status,
  routing_enabled,
  routable,
  country_code,
  base_url,
  metadata,
  provider_family_slug,
  offer_scope,
  offer_label,
  residency_mode,
  zero_data_retention,
  prompt_training_policy,
  data_policy_tier,
  data_policy_confidence,
  data_policy_contract_mode,
  data_policy_variant,
  stream_cancellation_support,
  stream_cancellation_usage_recovery,
  stream_cancellation_evidence_kind,
  byok_available,
  credential_mode
)
values (
  'unbiased',
  'unbiased',
  'Unbiased',
  'active',
  false,
  false,
  'xx',
  null,
  jsonb_build_object(
    'source', 'admin',
    'link', 'https://unbiased.ai/',
    'docs_url', 'https://unbiased.ai/model-card/',
    'gateway_kind', 'direct_model',
    'description', 'Unbiased direct model access; endpoint details are supplied after approval.',
    'access', jsonb_build_object(
      'status', 'limited_access',
      'approval_required', true,
      'endpoint_public', false
    ),
    'verification', jsonb_build_object(
      'status', 'partial',
      'checked_at', '2026-09-18T00:00:00Z'::timestamptz
    ),
    'sources', jsonb_build_array(
      jsonb_build_object('url', 'https://unbiased.ai/', 'kind', 'official_website'),
      jsonb_build_object('url', 'https://unbiased.ai/model-card/', 'kind', 'official_model_card'),
      jsonb_build_object('url', 'https://unbiased.ai/pricing/', 'kind', 'official_pricing')
    )
  ),
  null,
  'specialized',
  'Approval-only direct access',
  'unknown',
  false,
  'unknown',
  'unknown',
  'unknown',
  'none',
  'standard',
  'unknown',
  'unknown',
  'none',
  false,
  'byok_only'
)
on conflict (provider_slug) do update set
  lab_slug = excluded.lab_slug,
  name = excluded.name,
  status = excluded.status,
  routing_enabled = false,
  routable = false,
  country_code = excluded.country_code,
  base_url = excluded.base_url,
  metadata = public.v2_providers.metadata || excluded.metadata,
  provider_family_slug = excluded.provider_family_slug,
  offer_scope = excluded.offer_scope,
  offer_label = excluded.offer_label,
  residency_mode = excluded.residency_mode,
  zero_data_retention = excluded.zero_data_retention,
  prompt_training_policy = excluded.prompt_training_policy,
  data_policy_tier = excluded.data_policy_tier,
  data_policy_confidence = excluded.data_policy_confidence,
  data_policy_contract_mode = excluded.data_policy_contract_mode,
  data_policy_variant = excluded.data_policy_variant,
  stream_cancellation_support = excluded.stream_cancellation_support,
  stream_cancellation_usage_recovery = excluded.stream_cancellation_usage_recovery,
  stream_cancellation_evidence_kind = excluded.stream_cancellation_evidence_kind,
  byok_available = excluded.byok_available,
  credential_mode = excluded.credential_mode,
  updated_at = now();

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
  metadata,
  provider_availability_status,
  phaseo_status,
  access_scope,
  is_stealth,
  credential_mode
)
values (
  'unbiased:unbiased/pareto',
  'unbiased/pareto',
  'unbiased',
  'pareto',
  'active',
  false,
  array['text', 'image']::text[],
  array['text']::text[],
  array['global']::text[],
  262144,
  null,
  '2026-09-17T00:00:00Z'::timestamptz,
  jsonb_build_object(
    'source', 'admin',
    'source_key', 'unbiased:pareto',
    'routing_status', 'coming_soon',
    'routable', false,
    'direct_api_model_id', 'pareto',
    'sources', jsonb_build_array(
      jsonb_build_object('url', 'https://unbiased.ai/model-card/', 'kind', 'official_model_card'),
      jsonb_build_object('url', 'https://unbiased.ai/pricing/', 'kind', 'official_pricing')
    ),
    'verification', jsonb_build_object(
      'status', 'catalogue_verified',
      'checked_at', '2026-09-18T00:00:00Z'::timestamptz,
      'notes', 'This is a catalogue-only mapping. Phaseo has no endpoint credentials or executable provider adapter.'
    )
  ),
  'limited_access',
  'planned',
  'public',
  false,
  'byok_only'
)
on conflict (provider_model_id) do update set
  model_slug = excluded.model_slug,
  provider_slug = excluded.provider_slug,
  provider_model_slug = excluded.provider_model_slug,
  status = excluded.status,
  routing_enabled = false,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  regions = excluded.regions,
  context_length = excluded.context_length,
  max_output_tokens = excluded.max_output_tokens,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  metadata = public.v2_model_provider_routes.metadata || excluded.metadata,
  provider_availability_status = excluded.provider_availability_status,
  phaseo_status = excluded.phaseo_status,
  access_scope = excluded.access_scope,
  is_stealth = false,
  credential_mode = excluded.credential_mode,
  updated_at = now();

insert into public.v2_route_variants (
  provider_model_id,
  variant_key,
  execution_region,
  data_region,
  service_tier_slug,
  status,
  routing_enabled,
  endpoint_label,
  metadata
)
values (
  'unbiased:unbiased/pareto',
  'global:standard',
  'global',
  null,
  'standard',
  'active',
  false,
  'Standard',
  jsonb_build_object('source', 'admin', 'provider', 'unbiased', 'routing_status', 'coming_soon')
)
on conflict (provider_model_id, variant_key) do update set
  execution_region = excluded.execution_region,
  data_region = excluded.data_region,
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = false,
  endpoint_label = excluded.endpoint_label,
  metadata = public.v2_route_variants.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_route_capabilities (
  provider_model_id,
  capability_id,
  status,
  max_input_tokens,
  max_output_tokens,
  params,
  effective_from,
  metadata
)
values (
  'unbiased:unbiased/pareto',
  'text.generate',
  'active',
  262144,
  null,
  '{}'::jsonb,
  '2026-09-17T00:00:00Z'::timestamptz,
  jsonb_build_object(
    'source', 'admin',
    'capability_evidence', jsonb_build_object(
      'status', 'catalogue_verified',
      'source_url', 'https://unbiased.ai/model-card/',
      'notes', 'Unbiased documents text and image input with text output for Pareto.'
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
  metadata = public.v2_route_capabilities.metadata || excluded.metadata,
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
  route_variant_id,
  metadata
)
values (
  'unbiased:unbiased/pareto',
  'offer-unbiased-pareto-standard',
  1,
  'text.generate',
  'active',
  'standard',
  'Pareto 26.9',
  'Official Unbiased pricing. Direct access is approval-only; this Phaseo mapping is catalogue-only and not routable.',
  'USD',
  '2026-09-17T00:00:00Z'::timestamptz,
  (
    select variant_id
    from public.v2_route_variants
    where provider_model_id = 'unbiased:unbiased/pareto'
      and variant_key = 'global:standard'
  ),
  jsonb_build_object(
    'source', 'https://unbiased.ai/pricing/',
    'accessed_at', '2026-09-18T00:00:00Z'::timestamptz,
    'pricing_basis', 'Official Unbiased token pricing'
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
  metadata = public.v2_pricing_skus.metadata || excluded.metadata,
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
    ('input_text_tokens', 'text', 'input', 'token', 1000000::numeric, 2500000000::numeric, 'Input tokens', '1M tokens', true, 100, jsonb_build_object('source', 'https://unbiased.ai/pricing/')),
    ('cached_read_text_tokens', 'text', 'input', 'token', 1000000::numeric, 250000000::numeric, 'Cached input tokens', '1M tokens', true, 110, jsonb_build_object('source', 'https://unbiased.ai/pricing/')),
    ('output_text_tokens', 'text', 'output', 'token', 1000000::numeric, 7500000000::numeric, 'Output tokens', '1M tokens', true, 120, jsonb_build_object('source', 'https://unbiased.ai/pricing/'))
) as meter(meter_key, modality, direction, unit, unit_quantity, price_nanos, display_label, display_unit, billable, meter_order, metadata)
where sku.provider_model_id = 'unbiased:unbiased/pareto'
  and sku.sku_code = 'offer-unbiased-pareto-standard'
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
