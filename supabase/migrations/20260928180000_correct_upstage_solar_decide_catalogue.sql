-- Use Upstage's documented Solar Decide model ID in the catalogue.
-- The previous entry used the unpublished solar-jev identifier.

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
on conflict (model_slug) do update set
  lab_slug = excluded.lab_slug,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  hidden = excluded.hidden,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  family_slug = excluded.family_slug,
  metadata = excluded.metadata,
  updated_at = now();

-- Retarget the existing disabled route in place. Catalogue protection triggers
-- retain historical rows, so the incorrect model row is retired below.
do $$
declare
  v_release_event_id uuid;
  v_release_event_status text;
begin
  select id, status
  into v_release_event_id, v_release_event_status
  from public.model_release_push_events
  where model_slug = 'upstage/solar-jev'
  for update;

  if v_release_event_id is not null and v_release_event_status <> 'pending' then
    raise exception 'Solar Jev release event is no longer pending; refusing to rewrite it';
  end if;

  if v_release_event_id is not null then
    delete from public.model_release_push_events
    where model_slug = 'upstage/solar-decide'
      and id <> v_release_event_id;

    update public.model_release_push_events
    set model_slug = 'upstage/solar-decide',
        model_name = 'Solar Decide',
        lab_name = 'Upstage',
        released_at = coalesce(
          released_at,
          (select released_at from public.v2_models where model_slug = 'upstage/solar-decide')
        ),
        updated_at = now()
    where id = v_release_event_id and status = 'pending';
  else
    update public.model_release_push_events
    set model_name = 'Solar Decide',
        lab_name = 'Upstage',
        updated_at = now()
    where model_slug = 'upstage/solar-decide' and status = 'pending';
  end if;
end;
$$;

update public.v2_model_provider_routes
set model_slug = 'upstage/solar-decide',
    provider_model_slug = 'solar-decide',
    metadata = metadata || jsonb_build_object(
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
    updated_at = now()
where provider_model_id = 'upstage:upstage/solar-jev:systemone';

update public.v2_models
set name = 'Solar Jev (retired)',
    description = 'Retired catalogue record. Upstage documents Solar Decide as the model for System One.',
    status = 'disabled',
    hidden = true,
    metadata = metadata || jsonb_build_object(
      'retired', true,
      'replacement_model_slug', 'upstage/solar-decide'
    ),
    updated_at = now()
where model_slug = 'upstage/solar-jev';

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
  'available',
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
  effective_from = excluded.effective_from,
  metadata = excluded.metadata,
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
select
  route.provider_model_id,
  'global:standard',
  'standard',
  'disabled',
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
on conflict (provider_model_id, variant_key) do update set
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  endpoint_label = excluded.endpoint_label,
  metadata = excluded.metadata,
  updated_at = now();

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
on conflict (provider_model_id, capability_id) do update set
  status = excluded.status,
  params = excluded.params,
  effective_from = excluded.effective_from,
  metadata = excluded.metadata,
  updated_at = now();
