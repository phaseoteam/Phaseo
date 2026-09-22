-- Register the Gemini 3.8 TTS models discovered through Google's live Models API.
-- Routing remains disabled until Google publishes billable pricing for these IDs.

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
  variant_kind,
  catalogue_status
)
values
  (
    'google/gemini-3.8-flash-tts',
    'google',
    'Gemini 3.8 Flash TTS',
    'Gemini 3.8 Flash TTS is a Google text-to-speech model for generating spoken audio from text.',
    'active',
    false,
    array['text']::text[],
    array['audio_tts']::text[],
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'live_provider_api',
      'model_type', 'audio',
      'limits', jsonb_build_object('context', 8192, 'input', 8192, 'output', 16384),
      'modalities', jsonb_build_object('input', jsonb_build_array('text'), 'output', jsonb_build_array('audio/*')),
      'capabilities', jsonb_build_object(
        'attachment', null,
        'tool_call', null,
        'structured_output', null,
        'temperature', true,
        'streaming', null,
        'web_search', null,
        'batch_generate_content', true
      ),
      'sources', jsonb_build_array(jsonb_build_object(
        'kind', 'provider_models_api',
        'url', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts',
        'accessed_at', '2026-09-22T16:10:29Z',
        'notes', 'Authenticated Google Models API response.'
      )),
      'verification', jsonb_build_object(
        'status', 'verified',
        'checked_at', '2026-09-22T16:10:29Z',
        'notes', 'Google Models API confirmed the exact ID, display name, 8,192-token input limit, 16,384-token output limit, and generateContent, countTokens, and batchGenerateContent methods.'
      ),
      'legacy_model_id', 'google/gemini-3.8-flash-tts',
      'legacy_api_model_id', 'google/gemini-3.8-flash-tts'
    ),
    'Proprietary',
    'standard',
    'available'
  ),
  (
    'google/gemini-3.8-flash-lite-tts',
    'google',
    'Gemini 3.8 Flash Lite TTS',
    'Gemini 3.8 Flash Lite TTS is a lightweight Google text-to-speech model for generating spoken audio from text.',
    'active',
    false,
    array['text']::text[],
    array['audio_tts']::text[],
    null,
    null,
    null,
    jsonb_build_object(
      'source', 'live_provider_api',
      'model_type', 'audio',
      'limits', jsonb_build_object('context', 8192, 'input', 8192, 'output', 16384),
      'modalities', jsonb_build_object('input', jsonb_build_array('text'), 'output', jsonb_build_array('audio/*')),
      'capabilities', jsonb_build_object(
        'attachment', null,
        'tool_call', null,
        'structured_output', null,
        'temperature', true,
        'streaming', null,
        'web_search', null,
        'batch_generate_content', true
      ),
      'sources', jsonb_build_array(jsonb_build_object(
        'kind', 'provider_models_api',
        'url', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts',
        'accessed_at', '2026-09-22T16:10:29Z',
        'notes', 'Authenticated Google Models API response.'
      )),
      'verification', jsonb_build_object(
        'status', 'verified',
        'checked_at', '2026-09-22T16:10:29Z',
        'notes', 'Google Models API confirmed the exact ID, display name, 8,192-token input limit, 16,384-token output limit, and generateContent, countTokens, and batchGenerateContent methods.'
      ),
      'legacy_model_id', 'google/gemini-3.8-flash-lite-tts',
      'legacy_api_model_id', 'google/gemini-3.8-flash-lite-tts'
    ),
    'Proprietary',
    'standard',
    'available'
  )
on conflict (model_slug) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  hidden = excluded.hidden,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  metadata = excluded.metadata,
  license = excluded.license,
  catalogue_status = excluded.catalogue_status,
  updated_at = now();

insert into public.v2_model_links (model_slug, link_kind, title, url, metadata)
values
  (
    'google/gemini-3.8-flash-tts',
    'api_reference',
    'Gemini speech generation',
    'https://ai.google.dev/gemini-api/docs/speech-generation',
    '{}'::jsonb
  ),
  (
    'google/gemini-3.8-flash-lite-tts',
    'api_reference',
    'Gemini speech generation',
    'https://ai.google.dev/gemini-api/docs/speech-generation',
    '{}'::jsonb
  )
on conflict (model_slug, link_kind, url) do update set
  title = excluded.title,
  metadata = excluded.metadata,
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
  'google-ai-studio:' || model.model_slug,
  model.model_slug,
  'google-ai-studio',
  split_part(model.model_slug, '/', 2),
  'active',
  false,
  array['text']::text[],
  array['audio_tts']::text[],
  array['global']::text[],
  8192,
  16384,
  '2026-09-22T16:10:29Z'::timestamptz,
  jsonb_build_object(
    'source', 'live_provider_api',
    'routable', false,
    'routing_status', 'disabled',
    'routing_blocker', 'pricing_not_published',
    'api', jsonb_build_object('formats', jsonb_build_array(), 'endpoint', null, 'deployment', null),
    'regions', jsonb_build_object('data', null, 'execution', null),
    'availability', source_route.metadata->'availability',
    'service_tiers', jsonb_build_array(),
    'sources', model.metadata->'sources',
    'verification', model.metadata->'verification',
    'legacy_provider_api_model_id', 'google-ai-studio:' || model.model_slug
  ),
  'available',
  'unsupported',
  'public',
  false,
  'managed_and_byok'
from public.v2_models model
cross join public.v2_model_provider_routes source_route
where model.model_slug in (
  'google/gemini-3.8-flash-tts',
  'google/gemini-3.8-flash-lite-tts'
)
  and source_route.provider_model_id = 'google-ai-studio:google/gemini-3.1-flash-tts-preview'
on conflict (provider_model_id) do update set
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
select
  route.provider_model_id,
  'audio.speech',
  'active',
  8192,
  16384,
  '[]'::jsonb,
  '2026-09-22T16:10:29Z'::timestamptz,
  jsonb_build_object(
    'source', 'live_provider_api',
    'data_policy', null,
    'capability_evidence', jsonb_build_object(
      'capability_id', 'audio.speech',
      'status', 'active',
      'input_modalities', 'text',
      'output_modalities', 'audio',
      'attachment', false,
      'temperature', true,
      'batch_generate_content', true,
      'supported_generation_methods', jsonb_build_array('generateContent', 'countTokens', 'batchGenerateContent')
    )
  )
from public.v2_model_provider_routes route
where route.provider_model_id in (
  'google-ai-studio:google/gemini-3.8-flash-tts',
  'google-ai-studio:google/gemini-3.8-flash-lite-tts'
)
on conflict (provider_model_id, capability_id) do update set
  status = excluded.status,
  max_input_tokens = excluded.max_input_tokens,
  max_output_tokens = excluded.max_output_tokens,
  params = excluded.params,
  effective_from = excluded.effective_from,
  metadata = excluded.metadata,
  effective_to = null,
  updated_at = now();
