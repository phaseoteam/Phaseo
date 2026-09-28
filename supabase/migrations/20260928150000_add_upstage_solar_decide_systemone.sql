-- Catalog Upstage Solar Decide for Phaseo's native Decisions endpoint.
-- Keep routing gated until Upstage publishes Solar Decide pricing and a live
-- credentialed request has been verified.

insert into public.v2_models (
  model_slug, lab_slug, name, description, status, hidden,
  input_modalities, output_modalities, family_slug, metadata
)
values (
  'upstage/solar-decide',
  'upstage',
  'Solar Decide',
  'Upstage Solar Decide answers typed Noul, Choice, and Score questions against structured state.',
  'active',
  false,
  array['structured']::text[],
  array['decisions']::text[],
  'system-one',
  jsonb_build_object(
    'source_url', 'https://console.upstage.ai/api/systemone',
    'api_reference', 'https://console.upstage.ai/api/systemone',
    'provider_model_slug', 'solar-decide',
    'capability', 'decisions.make',
    'legacy_capability', 'systemone',
    'preview', true,
    'limits', jsonb_build_object('context', 524288),
    'pricing_status', 'not_published',
    'capability_evidence', jsonb_build_object(
      'question_types', jsonb_build_array('noul', 'choice', 'score')
    )
  )
)
on conflict (model_slug) do nothing;

insert into public.v2_model_provider_routes (
  provider_model_id, model_slug, provider_slug, provider_model_slug, status,
  routing_enabled, input_modalities, output_modalities, regions,
  context_length, effective_from, metadata, provider_availability_status,
  phaseo_status, access_scope, is_stealth, credential_mode
)
select
  'upstage:upstage/solar-decide:systemone',
  'upstage/solar-decide',
  'upstage',
  'solar-decide',
  'active',
  false,
  array['structured']::text[],
  array['decisions']::text[],
  array['global']::text[],
  524288,
  '2026-09-28T00:00:00Z'::timestamptz,
  jsonb_build_object(
    'source', 'admin',
    'source_url', 'https://console.upstage.ai/api/systemone',
    'api', jsonb_build_object(
      'endpoint', '/v1/systemone',
      'public_endpoint', '/v1/decisions',
      'format', 'upstage.systemone'
    ),
    'pricing_status', 'not_published',
    'verification', jsonb_build_object(
      'status', 'catalogue_verified',
      'checked_at', '2026-09-28T00:00:00Z'::timestamptz,
      'notes', 'Upstage documents Solar Decide and System One. Price is not listed on Upstage pricing, so routing remains disabled pending price confirmation and a live probe.'
    )
  ),
  'coming_soon',
  'testing',
  'public',
  false,
  'managed_and_byok'
where not exists (
  select 1
  from public.v2_model_provider_routes route
  where route.model_slug = 'upstage/solar-decide'
    and route.provider_slug = 'upstage'
    and route.provider_model_slug = 'solar-decide'
)
on conflict (provider_model_id) do nothing;

insert into public.v2_route_variants (
  provider_model_id, variant_key, service_tier_slug, status,
  routing_enabled, endpoint_label, metadata
)
select
  route.provider_model_id,
  'global:standard',
  'standard',
  'active',
  false,
  'Standard',
  jsonb_build_object('source', 'admin', 'preview', true, 'pricing_status', 'not_published')
from (
  select provider_model_id
  from public.v2_model_provider_routes
  where model_slug = 'upstage/solar-decide'
    and provider_slug = 'upstage'
    and provider_model_slug = 'solar-decide'
  order by (provider_model_id = 'upstage:upstage/solar-decide:systemone') desc
  limit 1
) route
on conflict (provider_model_id, variant_key) do nothing;

insert into public.v2_route_capabilities (
  provider_model_id, capability_id, status, params, effective_from, metadata
)
select
  route.provider_model_id,
  'decisions.make',
  'internal_testing',
  jsonb_build_object('model', true, 'state', true, 'questions', true),
  '2026-09-28T00:00:00Z'::timestamptz,
  jsonb_build_object(
    'source', 'admin',
    'capability_evidence', jsonb_build_object(
      'status', 'documented',
      'source_url', 'https://console.upstage.ai/api/systemone',
      'question_types', jsonb_build_array('noul', 'choice', 'score'),
      'context_length', 524288
    ),
    'pricing_status', 'not_published'
  )
from (
  select provider_model_id
  from public.v2_model_provider_routes
  where model_slug = 'upstage/solar-decide'
    and provider_slug = 'upstage'
    and provider_model_slug = 'solar-decide'
  order by (provider_model_id = 'upstage:upstage/solar-decide:systemone') desc
  limit 1
) route
on conflict (provider_model_id, capability_id) do nothing;
