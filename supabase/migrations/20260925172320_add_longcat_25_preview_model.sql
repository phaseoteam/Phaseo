-- Add the LongCat 2.5 Preview catalog entry and show its announced LongCat offer.
-- Keep Phaseo routing disabled until LongCat publishes the exact model ID and request contract.

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
  license_url,
  previous_model_slug,
  variant_kind,
  catalogue_status
)
values (
  'meituan/longcat-2.5-preview',
  'meituan',
  'LongCat 2.5 Preview',
  'Meituan describes LongCat 2.5 Preview as a natively multimodal model for long-horizon tasks across terminals, browsers, GUIs, spreadsheets, and design tools. The announcement reports 1.6T total parameters (about 48B active) and a 1M-token context window.',
  'draft',
  false,
  array[]::text[],
  array[]::text[],
  null,
  '2026-09-25T14:16:53Z'::timestamptz,
  '2026-09-25T14:16:53Z'::timestamptz,
  jsonb_build_object(
    'source', 'provider_announcement',
    'model_type', null,
    'license', null,
    'license_url', null,
    'limits', jsonb_build_object('context', 1000000, 'input', null, 'output', null),
    'modalities', jsonb_build_object('input', null, 'output', null),
    'reasoning', jsonb_build_object('supported', null, 'options', '[]'::jsonb),
    'capabilities', jsonb_build_object(
      'attachment', null,
      'tool_call', null,
      'structured_output', null,
      'temperature', null,
      'streaming', null,
      'web_search', null
    ),
    'open_weights', null,
    'sources', jsonb_build_array(
      jsonb_build_object(
        'kind', 'announcement',
        'url', 'https://x.com/Meituan_LongCat/status/2103488918788411728?s=20',
        'accessed_at', '2026-09-25T17:06:04Z',
        'notes', 'Official Meituan LongCat post announcing the preview, API availability, 1M-token context, 1.6T total parameters, and about 48B active parameters.'
      ),
      jsonb_build_object(
        'kind', 'playground',
        'url', 'https://longcat.ai/platform/',
        'accessed_at', '2026-09-25T17:06:04Z',
        'notes', 'API platform linked from the announcement. Public API docs do not yet specify a LongCat 2.5 Preview model ID or request contract.'
      )
    ),
    'verification', jsonb_build_object(
      'status', 'partial',
      'checked_at', '2026-09-25T17:06:04Z',
      'notes', 'The public announcement verifies the preview and stated context and parameter counts. The specific API model ID, modality contract, license, and Phaseo routing contract remain undocumented.'
    ),
    'legacy_model_id', 'meituan/longcat-2.5-preview',
    'legacy_api_model_id', null
  ),
  null,
  null,
  null,
  'standard',
  'preview'
)
on conflict (model_slug) do update set
  lab_slug = excluded.lab_slug,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  hidden = excluded.hidden,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  announced_at = excluded.announced_at,
  released_at = excluded.released_at,
  metadata = excluded.metadata,
  license = excluded.license,
  license_url = excluded.license_url,
  previous_model_slug = excluded.previous_model_slug,
  variant_kind = excluded.variant_kind,
  catalogue_status = excluded.catalogue_status,
  updated_at = now();

insert into public.v2_model_links (model_slug, link_kind, title, url, metadata)
values
  (
    'meituan/longcat-2.5-preview',
    'announcement',
    'Announcement',
    'https://x.com/Meituan_LongCat/status/2103488918788411728?s=20',
    '{"source":"provider_announcement"}'::jsonb
  ),
  (
    'meituan/longcat-2.5-preview',
    'playground',
    'LongCat API Platform',
    'https://longcat.ai/platform/',
    '{"source":"provider_announcement"}'::jsonb
  ),
  (
    'meituan/longcat-2.5-preview',
    'playground',
    'LongCat Chat',
    'https://longcat.ai/chat/',
    '{"source":"provider_announcement"}'::jsonb
  )
on conflict (model_slug, link_kind, url) do update set
  title = excluded.title,
  metadata = public.v2_model_links.metadata || excluded.metadata,
  updated_at = now();

insert into public.v2_model_details (model_slug, detail_name, detail_value, detail_order)
values
  ('meituan/longcat-2.5-preview', 'parameter_count', '"1.6T total"'::jsonb, 10),
  ('meituan/longcat-2.5-preview', 'active_parameter_count', '"~48B"'::jsonb, 20)
on conflict (model_slug, detail_name) do update set
  detail_value = excluded.detail_value,
  detail_order = excluded.detail_order,
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
select
  'longcat:meituan/longcat-2.5-preview',
  model.model_slug,
  'longcat',
  'LongCat-2.5-Preview',
  'active',
  false,
  array[]::text[],
  array[]::text[],
  array[]::text[],
  1000000,
  null,
  '2026-09-25T14:16:53Z'::timestamptz,
  jsonb_build_object(
    'source', 'provider_announcement',
    'routable', false,
    'routing_status', 'disabled',
    'routing_blocker', 'exact_model_api_contract_not_published',
    'api', jsonb_build_object(
      'formats', '[]'::jsonb,
      'endpoint', null,
      'deployment', null
    ),
    'regions', jsonb_build_object('execution', null, 'data', null),
    'availability', (
      select current_route.metadata->'availability'
      from public.v2_model_provider_routes current_route
      where current_route.provider_slug = 'longcat'
        and current_route.model_slug = 'meituan/longcat-2.0'
      limit 1
    ),
    'service_tiers', '[]'::jsonb,
    'sources', model.metadata->'sources',
    'verification', model.metadata->'verification',
    'legacy_provider_api_model_id', null
  ),
  'preview',
  'unsupported',
  'public',
  false,
  'managed_and_byok'
from public.v2_models model
where model.model_slug = 'meituan/longcat-2.5-preview'
on conflict (provider_model_id) do update set
  model_slug = excluded.model_slug,
  provider_model_slug = excluded.provider_model_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  regions = excluded.regions,
  context_length = excluded.context_length,
  max_output_tokens = excluded.max_output_tokens,
  effective_from = excluded.effective_from,
  metadata = excluded.metadata,
  provider_availability_status = excluded.provider_availability_status,
  phaseo_status = excluded.phaseo_status,
  access_scope = excluded.access_scope,
  is_stealth = excluded.is_stealth,
  credential_mode = excluded.credential_mode,
  updated_at = now();
