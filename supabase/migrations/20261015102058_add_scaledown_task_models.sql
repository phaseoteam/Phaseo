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
-- The replay baseline contains schema only, so seed these shared definitions
-- just as the TypeSafe Jev migration does. Preserve existing production meters.
insert into public.v2_meter_definitions (
  meter_key, display_name, modality, direction, unit, default_unit_quantity
)
values
  ('input_tokens', 'Input tokens', 'text', 'input', 'token', 1000000),
  ('output_tokens', 'Output tokens', 'text', 'output', 'token', 1000000)
on conflict (meter_key) do nothing;

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

-- Show explicitly coming-soon routes even while their provider routing is off.
CREATE OR REPLACE FUNCTION public.get_v2_public_models_page_rows_without_lifecycle (
  p_region       text DEFAULT NULL::text,
  p_service_tier text DEFAULT 'standard'::text
)
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with candidate_routes as (
    select
      route.provider_model_id,
      route.model_slug,
      route.provider_slug,
      route.provider_model_slug,
      route.input_modalities,
      route.output_modalities,
      route.context_length,
      route.max_output_tokens,
      route.status as route_status,
      route.routing_enabled as route_routing_enabled,
      route.provider_availability_status,
      model.name,
      model.description,
      model.status as model_status,
      model.hidden,
      model.announced_at,
      model.released_at,
      model.input_modalities as model_input_modalities,
      model.output_modalities as model_output_modalities,
      model.lab_slug,
      lab.name as lab_name,
      provider.name as provider_name,
      provider.status as provider_status,
      provider.routing_enabled as provider_routing_enabled,
      variant.variant_id,
      variant.service_tier_slug,
      variant.execution_region,
      variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      region.region_code
    from public.v2_model_provider_routes route
    join public.v2_models model on model.model_slug = route.model_slug
    join public.v2_labs lab on lab.lab_slug = model.lab_slug
    join public.v2_providers provider on provider.provider_slug = route.provider_slug
    join public.v2_route_variants variant on variant.provider_model_id = route.provider_model_id
    left join public.v2_provider_regions region
      on region.provider_slug = route.provider_slug
     and region.status <> 'disabled'
     and region.routing_enabled = true
    where model.hidden = false
      and model.status <> 'disabled'
      and provider.status <> 'disabled'
      and route.status in ('active', 'degraded')
      and variant.status in ('active', 'degraded')
      and (
        provider.routing_enabled = true
        or (
          route.provider_availability_status = 'coming_soon'
          and route.access_scope = 'public'
          and route.routing_enabled = false
          and variant.routing_enabled = false
        )
      )
      and (p_service_tier is null or variant.service_tier_slug = lower(p_service_tier))
      and (
        p_region is null
        or lower(p_region) = lower(coalesce(variant.execution_region, ''))
        or lower(p_region) = lower(coalesce(variant.data_region, ''))
        or lower(p_region) = lower(coalesce(region.region_code, ''))
        or lower(p_region) = any(route.regions)
      )
  ),
  eligible_routes as (
    select *
    from candidate_routes
    where route_routing_enabled = true
      and provider_routing_enabled = true
      and variant_routing_enabled = true
  ),
  preview_routes as (
    select *
    from candidate_routes
    where route_routing_enabled = false
      and variant_routing_enabled = false
      and provider_availability_status = 'coming_soon'
  ),
  display_routes as (
    select * from eligible_routes
    union all
    select * from preview_routes
  ),
  capability_rows as (
    select
      capability.provider_model_id,
      array_agg(distinct capability.capability_id order by capability.capability_id)
        filter (where capability.status <> 'disabled') as capabilities,
      array_agg(distinct parameter.key order by parameter.key)
        filter (where parameter.key is not null) as supported_parameters
    from public.v2_route_capabilities capability
    left join lateral jsonb_object_keys(
      case when jsonb_typeof(capability.params) = 'object' then capability.params else '{}'::jsonb end
    ) parameter(key) on true
    where capability.status <> 'disabled'
    group by capability.provider_model_id
  ),
  route_modalities as (
    select
      route.model_slug,
      array_agg(distinct input_modality order by input_modality) filter (where input_modality is not null and input_modality <> '') as input_modalities,
      array_agg(distinct output_modality order by output_modality) filter (where output_modality is not null and output_modality <> '') as output_modalities
    from eligible_routes route
    left join lateral unnest(route.input_modalities) input(input_modality) on true
    left join lateral unnest(route.output_modalities) output(output_modality) on true
    group by route.model_slug
  ),
  -- Prices come only from routable routes the page shows (coming-soon
  -- previews only for models with no routable route), and only from active
  -- SKUs in effect now. Only a higher version of the same SKU code replaces a
  -- SKU; different codes are independent families (for example short and
  -- long context). Without a region filter, a regional price is used only
  -- when the route has no global price for that meter. Rows carry an
  -- anonymous route group so the API can pick the cheapest offer, and the
  -- provider's slug (never for stealth routes) so the card can name it.
  pricing_routes as (
    select * from eligible_routes
    union all
    select * from preview_routes preview
    where not exists (
      select 1 from eligible_routes eligible where eligible.model_slug = preview.model_slug
    )
  ),
  priced_routes as (
    select distinct
      priced.provider_model_id,
      priced.model_slug,
      priced.provider_slug,
      coalesce(route.is_stealth, false) as is_stealth
    from pricing_routes priced
    join public.v2_model_provider_routes route on route.provider_model_id = priced.provider_model_id
  ),
  -- A SKU tied to a variant counts only when it is one of those routes' variants.
  priced_variants as (
    select distinct variant_id
    from pricing_routes
  ),
  -- The latest live version of each SKU code, chosen per whole SKU (so meters
  -- dropped in a newer version do not survive from an older one) and before
  -- the variant, service tier and region filters (so a superseded version
  -- cannot resurface where the current version does not apply).
  current_skus as (
    select *
    from (
      select
        sku.sku_id,
        sku.route_variant_id,
        sku.status,
        sku.effective_to,
        route.model_slug,
        route.provider_slug,
        route.is_stealth,
        sku.provider_model_id,
        sku.service_tier_slug,
        sku.operation,
        -- Conditional SKUs (for example one price per resolution or with or
        -- without audio) carry their conditions and a human description.
        case
          when jsonb_typeof(sku.metadata->'match') = 'array' and jsonb_array_length(sku.metadata->'match') > 0
            then sku.metadata->'match'
        end as conditions,
        nullif(btrim(sku.description), '') as sku_description,
        -- Each region dimension separately, so a request can match any of
        -- them; a price is global only when none is set.
        nullif(nullif(lower(coalesce(sku.region, '')), ''), 'global') as sku_region,
        nullif(nullif(lower(coalesce(variant.execution_region, '')), ''), 'global') as execution_region,
        nullif(nullif(lower(coalesce(variant.data_region, '')), ''), 'global') as data_region,
        dense_rank() over (
          partition by sku.provider_model_id, sku.sku_code
          order by sku.version desc
        ) as recency
      from public.v2_pricing_skus sku
      join priced_routes route on route.provider_model_id = sku.provider_model_id
      left join public.v2_route_variants variant on variant.variant_id = sku.route_variant_id
      where sku.status <> 'draft'
        and sku.effective_from <= now()
    ) ranked
    -- An expired, deprecated or disabled latest version hides its
    -- predecessors rather than reviving them.
    where ranked.recency = 1
      and ranked.status = 'active'
      and (ranked.effective_to is null or ranked.effective_to > now())
      and (
        ranked.route_variant_id is null
        or ranked.route_variant_id in (select variant_id from priced_variants)
      )
      and (p_service_tier is null or ranked.service_tier_slug = lower(p_service_tier))
      -- A SKU's own region is a pricing region and must match the request;
      -- only a SKU without one inherits either of its variant's regions.
      and (
        p_region is null
        or coalesce(ranked.sku_region, ranked.execution_region, ranked.data_region) is null
        or (ranked.sku_region is not null and ranked.sku_region = lower(p_region))
        or (
          ranked.sku_region is null
          and lower(p_region) in (coalesce(ranked.execution_region, ''), coalesce(ranked.data_region, ''))
        )
      )
  ),
  live_meters as (
    select
      sku.model_slug,
      sku.provider_slug,
      sku.is_stealth,
      sku.provider_model_id,
      sku.service_tier_slug,
      sku.operation,
      coalesce(sku.sku_region, sku.execution_region, sku.data_region) as pricing_region,
      meter.meter_key,
      meter.modality,
      meter.direction,
      meter.unit,
      meter.unit_quantity,
      meter.price_nanos,
      meter.display_label,
      meter.display_unit,
      meter.meter_order,
      conditional.conditions,
      -- Only conditional prices get a variant label: the meter's note, else
      -- the SKU description.
      case
        when conditional.conditions is not null
          then coalesce(nullif(btrim(meter.metadata->>'note'), ''), sku.sku_description)
      end as variant
    from current_skus sku
    join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id and meter.billable
    -- Conditions may sit on the SKU or on the meter; the SKU's win, as in the
    -- gateway's billing.
    cross join lateral (
      select coalesce(
        sku.conditions,
        case
          when jsonb_typeof(meter.metadata->'match') = 'array' and jsonb_array_length(meter.metadata->'match') > 0
            then meter.metadata->'match'
        end
      ) as conditions
    ) conditional
  ),
  -- Global availability is judged over current versions only.
  current_meters as (
    select *
    from (
      select
        live.*,
        bool_or(live.pricing_region is null) over (
          partition by live.provider_model_id, live.service_tier_slug, live.operation, live.meter_key
        ) as has_global_price,
        -- An opaque per-model route number, so offers can be compared without
        -- naming a provider (stealth routes stay anonymous) and two routes of
        -- one provider are never blended into one price.
        dense_rank() over (
          partition by live.model_slug
          order by live.provider_model_id
        ) as provider_group
      from live_meters live
    ) ranked
    where p_region is not null or ranked.pricing_region is null or not ranked.has_global_price
  ),
  pricing_rows as (
    select
      meter.model_slug,
      min(meter.price_nanos / 1000000000.0) filter (where meter.direction = 'input') as lowest_input_price,
      min(meter.price_nanos / 1000000000.0) filter (where meter.direction = 'output') as lowest_output_price,
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'label', meter.display_label,
          'meter_key', meter.meter_key,
          'modality', meter.modality,
          'direction', meter.direction,
          'unit', meter.unit,
          'unit_quantity', meter.unit_quantity,
          'price', meter.price_nanos / 1000000000.0,
          'display_unit', meter.display_unit,
          'service_tier', meter.service_tier_slug,
          'provider_group', meter.provider_group,
          'provider', case when not meter.is_stealth then meter.provider_slug end,
          'variant', meter.variant,
          'conditions', meter.conditions
        ))
        order by meter.meter_order, meter.meter_key, meter.provider_group, meter.price_nanos
      ) as pricing_detail_rows
    from current_meters meter
    group by meter.model_slug
  ),
  capability_summary as (
    select
      eligible.model_slug,
      array_agg(distinct capability_id order by capability_id) as capabilities,
      array_agg(distinct case
        when capability_id ilike '%tool%' then 'tools'
        when capability_id ilike '%structured%' then 'structured_outputs'
        when capability_id ilike '%reason%' or capability_id ilike '%thinking%' then 'reasoning'
        when capability_id ilike '%search%' then 'web_search'
        else null
      end order by case
        when capability_id ilike '%tool%' then 'tools'
        when capability_id ilike '%structured%' then 'structured_outputs'
        when capability_id ilike '%reason%' or capability_id ilike '%thinking%' then 'reasoning'
        when capability_id ilike '%search%' then 'web_search'
        else null
      end) filter (where capability_id is not null) as features,
      array_agg(distinct parameter order by parameter) filter (where parameter is not null) as supported_parameters
    from eligible_routes eligible
    join public.v2_route_capabilities capability on capability.provider_model_id = eligible.provider_model_id
    left join lateral jsonb_object_keys(
      case when jsonb_typeof(capability.params) = 'object' then capability.params else '{}'::jsonb end
    ) parameter on true
    where capability.status <> 'disabled'
    group by eligible.model_slug
  ),
  grouped as (
    select
      route.model_slug,
      max(route.name) as name,
      max(route.description) as description,
      max(route.model_status) as model_status,
      bool_or(route.hidden) as hidden,
      max(route.announced_at) as announced_at,
      max(route.released_at) as released_at,
      max(route.lab_slug) as lab_slug,
      max(route.lab_name) as lab_name,
      count(distinct route.provider_model_id)::integer as provider_count,
      count(distinct route.provider_model_id) filter (
        where route.route_status = 'active'
          and route.route_routing_enabled
          and route.provider_status not in ('disabled', 'deprecated')
          and route.provider_routing_enabled
          and route.variant_routing_enabled
      )::integer as active_provider_count,
      count(distinct route.provider_model_id) filter (
        where route.provider_availability_status = 'coming_soon'
          and not route.route_routing_enabled
          and not route.variant_routing_enabled
      )::integer as coming_soon_provider_count,
      array_agg(distinct route.provider_slug order by route.provider_slug) as provider_ids,
      array_agg(distinct route.provider_name order by route.provider_name) as provider_names,
      array_agg(distinct route.provider_name order by route.provider_name) filter (
        where route.route_status = 'active'
          and route.route_routing_enabled
          and route.provider_routing_enabled
          and route.variant_routing_enabled
      ) as active_provider_names,
      array_agg(distinct route.provider_model_slug order by route.provider_model_slug) as provider_model_slugs,
      array_agg(distinct route.service_tier_slug order by route.service_tier_slug) as service_tiers,
      array_agg(distinct nullif(lower(coalesce(route.execution_region, route.data_region, route.region_code)), '') order by nullif(lower(coalesce(route.execution_region, route.data_region, route.region_code)), '')) filter (where nullif(lower(coalesce(route.execution_region, route.data_region, route.region_code)), '') is not null) as regions,
      array_agg(distinct route.context_length order by route.context_length) filter (where route.context_length is not null) as context_lengths,
      jsonb_agg(distinct jsonb_build_object(
        'id', route.provider_slug,
        'name', route.provider_name,
        'provider_model_slug', route.provider_model_slug,
        'service_tier', route.service_tier_slug,
        'execution_region', route.execution_region,
        'data_region', route.data_region,
        'is_active', route.route_status = 'active' and route.route_routing_enabled and route.provider_routing_enabled and route.variant_routing_enabled,
        'status', case
          when route.provider_availability_status = 'coming_soon' then 'coming_soon'
          when route.route_status = 'active' and route.route_routing_enabled and route.provider_routing_enabled and route.variant_routing_enabled then 'active'
          else 'inactive'
        end
      )) as provider_details
    from display_routes route
    group by route.model_slug
  )
  select jsonb_build_object(
    'model_id', grouped.model_slug,
    'name', grouped.name,
    'description', grouped.description,
    'organisation_id', grouped.lab_slug,
    'organisation_name', grouped.lab_name,
    'primary_date', coalesce(grouped.released_at, grouped.announced_at),
    'primary_timestamp', extract(epoch from coalesce(grouped.released_at, grouped.announced_at)) * 1000,
    'primary_group_key', to_char(coalesce(grouped.released_at, grouped.announced_at), 'YYYY-MM'),
    'gateway_status', case
      when grouped.active_provider_count > 0 then 'active'
      when grouped.coming_soon_provider_count > 0 then 'coming_soon'
      when lower(coalesce(grouped.model_status, '')) = 'draft' then 'coming_soon'
      else 'not_active'
    end,
    'gateway_provider_count', grouped.provider_count,
    'gateway_active_provider_count', grouped.active_provider_count,
    'gateway_endpoints', coalesce(capability_summary.capabilities, array[]::text[]),
    'gateway_input_modalities', coalesce(modalities.input_modalities, array[]::text[]),
    'gateway_output_modalities', coalesce(modalities.output_modalities, array[]::text[]),
    'gateway_features', coalesce(capability_summary.features, array[]::text[]),
    'gateway_tiers', coalesce(grouped.service_tiers, array[]::text[]),
    'gateway_provider_names', coalesce(grouped.provider_names, array[]::text[]),
    'gateway_active_provider_names', coalesce(grouped.active_provider_names, array[]::text[]),
    'gateway_execution_regions', coalesce(grouped.regions, array[]::text[]),
    'gateway_provider_details', coalesce(grouped.provider_details, '[]'::jsonb),
    'gateway_api_model_ids', coalesce(grouped.provider_model_slugs, array[]::text[]),
    'context_lengths', coalesce(grouped.context_lengths, array[]::integer[]),
    'supported_parameters', coalesce(capability_summary.supported_parameters, array[]::text[]),
    'lowest_input_price', pricing.lowest_input_price,
    'lowest_output_price', pricing.lowest_output_price,
    'lowest_standard_input_price', pricing.lowest_input_price,
    'lowest_standard_output_price', pricing.lowest_output_price,
    'lowest_standard_input_price_label', 'Input',
    'lowest_standard_input_price_unit', 'billing unit',
    'lowest_standard_output_price_label', 'Output',
    'lowest_standard_output_price_unit', 'billing unit',
    'lowest_from_price', least(pricing.lowest_input_price, pricing.lowest_output_price),
    'lowest_from_price_unit', 'billing unit',
    'pricing_detail_rows', coalesce(pricing.pricing_detail_rows, '[]'::jsonb),
    'gateway_monitor_rows', '[]'::jsonb,
    'popularity_tokens_week', null,
    'throughput_week', null,
    'latency_week', null
  )
  from grouped
  left join route_modalities modalities on modalities.model_slug = grouped.model_slug
  left join pricing_rows pricing on pricing.model_slug = grouped.model_slug
  left join capability_summary on capability_summary.model_slug = grouped.model_slug
  order by grouped.released_at desc nulls last, grouped.lab_name, grouped.name;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_public_models_page_rows_without_lifecycle"(text, text) TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_public_models_page_rows_without_lifecycle"(text, text) IS 'Returns active gateway model rows plus explicitly coming-soon provider mappings without exposing preview routes as active capabilities.';

REVOKE ALL ON FUNCTION "public"."get_v2_public_models_page_rows_without_lifecycle"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_public_models_page_rows_without_lifecycle"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_public_models_page_rows_without_lifecycle"(text, text) FROM PUBLIC, "anon", "authenticated";
