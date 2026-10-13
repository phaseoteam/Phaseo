-- Catalogue ScaleDown's task-specific models, launched on 2026-10-13.
-- Summarize and Extract use ScaleDown's OpenAI-compatible Chat Completions and
-- return their result as a JSON string in the message content. Classify-1 uses
-- ScaleDown's Jev-compatible /v1/scaledown endpoint behind Phaseo's /v1/decisions.
-- Routing stays disabled until the managed SCALEDOWN_API_KEY secret is installed
-- and a live probe has passed.

insert into public.v2_labs (
  lab_slug, name, country_code, description, status, routable, metadata
)
values (
  'scaledown',
  'ScaleDown',
  'xx',
  'ScaleDown builds task-specific small language models for summarization, extraction, classification and context compression.',
  'active',
  false,
  jsonb_build_object(
    'source_url', 'https://scaledown.ai/',
    'documentation_url', 'https://docs.scaledown.ai/introduction'
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
  'scaledown',
  'scaledown',
  'ScaleDown',
  'not_ready',
  false,
  false,
  'xx',
  'https://api.scaledown.xyz',
  jsonb_build_object(
    'source_url', 'https://scaledown.ai/',
    'documentation_url', 'https://docs.scaledown.ai/introduction',
    'adapter_ready', true,
    'credentials_ready', false,
    'auth_env', 'SCALEDOWN_API_KEY',
    'auth_header', 'x-api-key'
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
  input_modalities, output_modalities, family_slug, announced_at, released_at, metadata
)
values
  (
    'scaledown/summarize',
    'scaledown',
    'Summarize',
    'ScaleDown Summarize writes abstractive summaries of long text. A system message can set format, focus or length, and the summary is returned as JSON in the message content.',
    'active',
    false,
    array['text']::text[],
    array['text']::text[],
    null,
    '2026-10-13T00:00:00Z'::timestamptz,
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source_url', 'https://docs.scaledown.ai/api-reference/summarize',
      'api_reference', 'https://docs.scaledown.ai/api-reference/summarize',
      'provider_model_slug', 'summarize-1',
      'model_type', 'summarization',
      'preview', true,
      'limits', jsonb_build_object('context', 1000000, 'output', 1000),
      'capabilities', jsonb_build_object('streaming', false, 'tool_call', false, 'temperature', false, 'structured_output', false)
    )
  ),
  (
    'scaledown/extract',
    'scaledown',
    'Extract',
    'ScaleDown Extract finds the fields you describe in a JSON schema and returns each match with a confidence score, character offsets and surrounding context, as JSON in the message content.',
    'active',
    false,
    array['text']::text[],
    array['text']::text[],
    null,
    '2026-10-13T00:00:00Z'::timestamptz,
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source_url', 'https://docs.scaledown.ai/api-reference/extract',
      'api_reference', 'https://docs.scaledown.ai/api-reference/extract',
      'provider_model_slug', 'extract-1',
      'model_type', 'extraction',
      'preview', true,
      'limits', jsonb_build_object('context', 1000000),
      'capabilities', jsonb_build_object('streaming', false, 'tool_call', false, 'temperature', false, 'structured_output', true)
    )
  ),
  (
    'scaledown/classify-1',
    'scaledown',
    'Classify-1',
    'ScaleDown Classify-1 answers typed Noul, Choice and Score questions with calibrated probabilities instead of generated text.',
    'active',
    false,
    array['structured']::text[],
    array['decisions']::text[],
    'system-one',
    '2026-10-13T00:00:00Z'::timestamptz,
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source_url', 'https://docs.scaledown.ai/api-reference/decisions',
      'api_reference', 'https://docs.scaledown.ai/api-reference/decisions',
      'provider_model_slug', 'classify-1',
      'capability', 'decisions.make',
      'legacy_capability', 'systemone',
      'preview', true,
      'capability_evidence', jsonb_build_object(
        'question_types', jsonb_build_array('noul', 'choice', 'score')
      )
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
  announced_at = excluded.announced_at,
  released_at = excluded.released_at,
  metadata = public.v2_models.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_aliases (
  alias_slug, model_slug, alias_type, enabled, metadata
)
values
  ('scaledown/summarize-1', 'scaledown/summarize', 'version', true, jsonb_build_object('provider_model_slug', 'summarize-1', 'source', 'scaledown')),
  ('scaledown/extract-1', 'scaledown/extract', 'version', true, jsonb_build_object('provider_model_slug', 'extract-1', 'source', 'scaledown')),
  ('scaledown/classify', 'scaledown/classify-1', 'public', true, jsonb_build_object('provider_model_slug', 'classify-1', 'source', 'scaledown'))
on conflict (alias_slug) do update set
  model_slug = excluded.model_slug,
  alias_type = excluded.alias_type,
  enabled = excluded.enabled,
  metadata = public.v2_model_aliases.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_provider_routes (
  provider_model_id, model_slug, provider_slug, provider_model_slug, status,
  routing_enabled, input_modalities, output_modalities, regions,
  context_length, max_output_tokens, effective_from, metadata,
  provider_availability_status, phaseo_status, access_scope, is_stealth, credential_mode
)
values
  (
    'scaledown:scaledown/summarize:chat',
    'scaledown/summarize',
    'scaledown',
    'summarize-1',
    'active',
    false,
    array['text']::text[],
    array['text']::text[],
    array['global']::text[],
    1000000,
    1000,
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source', 'admin',
      'source_url', 'https://docs.scaledown.ai/api-reference/summarize',
      'api', jsonb_build_object('endpoint', '/v1/chat/completions', 'format', 'openai.chat.completions'),
      'verification', jsonb_build_object(
        'status', 'catalogue_verified',
        'checked_at', '2026-10-13T00:00:00Z'::timestamptz,
        'notes', 'ScaleDown documents a 1,000 output-token cap; OpenRouter lists a 1M context. The managed credential and live probe are pending.'
      )
    ),
    'coming_soon',
    'testing',
    'public',
    false,
    'managed_and_byok'
  ),
  (
    'scaledown:scaledown/extract:chat',
    'scaledown/extract',
    'scaledown',
    'extract-1',
    'active',
    false,
    array['text']::text[],
    array['text']::text[],
    array['global']::text[],
    1000000,
    null,
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source', 'admin',
      'source_url', 'https://docs.scaledown.ai/api-reference/extract',
      'api', jsonb_build_object('endpoint', '/v1/chat/completions', 'format', 'openai.chat.completions'),
      'verification', jsonb_build_object(
        'status', 'catalogue_verified',
        'checked_at', '2026-10-13T00:00:00Z'::timestamptz,
        'notes', 'Extract requires response_format json_schema. OpenRouter lists a 1M context. The managed credential and live probe are pending.'
      )
    ),
    'coming_soon',
    'testing',
    'public',
    false,
    'managed_and_byok'
  ),
  (
    'scaledown:scaledown/classify-1:systemone',
    'scaledown/classify-1',
    'scaledown',
    'classify-1',
    'active',
    false,
    array['structured']::text[],
    array['decisions']::text[],
    array['global']::text[],
    null,
    null,
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source', 'admin',
      'source_url', 'https://docs.scaledown.ai/api-reference/decisions',
      'api', jsonb_build_object(
        'endpoint', '/v1/scaledown',
        'public_endpoint', '/v1/decisions',
        'format', 'scaledown.systemone'
      ),
      'verification', jsonb_build_object(
        'status', 'catalogue_verified',
        'checked_at', '2026-10-13T00:00:00Z'::timestamptz,
        'notes', 'ScaleDown documents a Jev-compatible Decisions endpoint. Choice questions are capped at 20 options and Score at 2 to 10 levels. The managed credential and live probe are pending.'
      )
    ),
    'coming_soon',
    'testing',
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
select route_id, 'global:standard', 'standard', 'active', false, 'Standard',
  jsonb_build_object('source', 'admin', 'preview', true)
from (values
  ('scaledown:scaledown/summarize:chat'),
  ('scaledown:scaledown/extract:chat'),
  ('scaledown:scaledown/classify-1:systemone')
) as route(route_id)
on conflict (provider_model_id, variant_key) do update set
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  endpoint_label = excluded.endpoint_label,
  metadata = public.v2_route_variants.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_route_capabilities (
  provider_model_id, capability_id, status, max_input_tokens, max_output_tokens,
  params, effective_from, metadata
)
values
  (
    'scaledown:scaledown/summarize:chat',
    'text.generate',
    'internal_testing',
    null,
    1000,
    '["max_tokens","max_completion_tokens"]'::jsonb,
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source', 'admin',
      'capability_evidence', jsonb_build_object(
        'status', 'documented',
        'source_url', 'https://docs.scaledown.ai/api-reference/summarize',
        'notes', 'Sampling is fixed by ScaleDown; streaming and tools are not supported.'
      )
    )
  ),
  (
    'scaledown:scaledown/extract:chat',
    'text.generate',
    'internal_testing',
    null,
    null,
    '["max_tokens","max_completion_tokens","response_format"]'::jsonb,
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source', 'admin',
      'capability_evidence', jsonb_build_object(
        'status', 'documented',
        'source_url', 'https://docs.scaledown.ai/api-reference/extract',
        'notes', 'response_format json_schema is required; streaming and tools are not supported.'
      )
    )
  ),
  (
    'scaledown:scaledown/classify-1:systemone',
    'decisions.make',
    'internal_testing',
    null,
    null,
    jsonb_build_object('model', true, 'state', true, 'questions', true),
    '2026-10-13T00:00:00Z'::timestamptz,
    jsonb_build_object(
      'source', 'admin',
      'capability_evidence', jsonb_build_object(
        'status', 'documented',
        'source_url', 'https://docs.scaledown.ai/api-reference/decisions',
        'question_types', jsonb_build_array('noul', 'choice', 'score')
      )
    )
  )
on conflict (provider_model_id, capability_id) do update set
  status = excluded.status,
  max_input_tokens = excluded.max_input_tokens,
  max_output_tokens = excluded.max_output_tokens,
  params = excluded.params,
  effective_from = excluded.effective_from,
  metadata = public.v2_route_capabilities.metadata || excluded.metadata,
  updated_at = now();

-- ScaleDown bills input tokens only. $0.05 per million is the undiscounted rate
-- that OpenRouter (before its 20% launch discount) and Vercel AI Gateway list.
insert into public.v2_pricing_skus (
  provider_model_id, sku_code, version, operation, status, service_tier_slug,
  display_name, description, currency, effective_from, route_variant_id, metadata
)
select
  sku.route_id, sku.sku_code, 1, sku.operation, 'active', 'standard',
  sku.display_name,
  '$0.05 per million input tokens. Output is free.',
  'USD',
  '2026-10-13T00:00:00Z'::timestamptz,
  (
    select variant_id
    from public.v2_route_variants
    where provider_model_id = sku.route_id
      and variant_key = 'global:standard'
  ),
  jsonb_build_object(
    'source_url', 'https://openrouter.ai/scaledown',
    'pricing_basis', 'ScaleDown list price as published by OpenRouter (pre-discount) and Vercel AI Gateway',
    'preview', true
  )
from (values
  ('scaledown:scaledown/summarize:chat', 'scaledown-summarize-chat', 'text.generate', 'Summarize'),
  ('scaledown:scaledown/extract:chat', 'scaledown-extract-chat', 'text.generate', 'Extract'),
  ('scaledown:scaledown/classify-1:systemone', 'scaledown-classify-1-systemone', 'decisions.make', 'Classify-1')
) as sku(route_id, sku_code, operation, display_name)
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
      50000000::numeric, 'Input tokens', '1M tokens', true, 100,
      jsonb_build_object('source', 'scaledown', 'price_per_million_usd', 0.05)
    ),
    (
      'output_tokens', 'text', 'output', 'token', 1000000::numeric,
      0::numeric, 'Output tokens', '1M tokens', true, 110,
      jsonb_build_object('source', 'scaledown', 'price_per_million_usd', 0)
    )
) as meter(
  meter_key, modality, direction, unit, unit_quantity, price_nanos,
  display_label, display_unit, billable, meter_order, metadata
)
where sku.sku_code in ('scaledown-summarize-chat', 'scaledown-extract-chat', 'scaledown-classify-1-systemone')
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
  ('scaledown/summarize', 'documentation', 'ScaleDown Summarize API reference', 'https://docs.scaledown.ai/api-reference/summarize', jsonb_build_object('source', 'scaledown')),
  ('scaledown/extract', 'documentation', 'ScaleDown Extract API reference', 'https://docs.scaledown.ai/api-reference/extract', jsonb_build_object('source', 'scaledown')),
  ('scaledown/classify-1', 'documentation', 'ScaleDown Decisions API reference', 'https://docs.scaledown.ai/api-reference/decisions', jsonb_build_object('source', 'scaledown'))
on conflict (model_slug, link_kind, url) do update set
  title = excluded.title,
  metadata = public.v2_model_links.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_page_notices (model_slug, tone, markdown)
values
  (
    'scaledown/summarize',
    'info',
    'Summarize is a task model, not a chat model. Send the text as the last user message; the reply content is a JSON string with a `summary` field. Streaming, tools and sampling parameters are not supported.'
  ),
  (
    'scaledown/extract',
    'info',
    'Extract is a task model, not a chat model. Describe the fields to extract with `response_format` `json_schema`; the reply content is a JSON string of matched entities with confidence scores. Streaming and tools are not supported.'
  ),
  (
    'scaledown/classify-1',
    'info',
    'Classify-1 is a structured decision model. Use the Decisions playground or the `/v1/decisions` endpoint with typed Noul, Choice and Score questions.'
  )
on conflict (model_slug) do update set
  tone = excluded.tone,
  markdown = excluded.markdown,
  updated_at = now();
