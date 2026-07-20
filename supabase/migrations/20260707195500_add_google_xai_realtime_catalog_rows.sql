-- Add Google Live and xAI Grok realtime catalog, provider, voice, and pricing rows.
-- Realtime session creation loads price cards from data_api_pricing_rules.

insert into public.data_organisations (
  organisation_id,
  name,
  country_code,
  description,
  colour
)
values (
  'x-ai',
  'xAI',
  'US',
  'X-AI is an AI company. Their mission is to craft next-generation model and agent systems which set new standards in capability, deployment and human-machine interaction.',
  '#000000'
)
on conflict (organisation_id) do update set
  name = excluded.name,
  country_code = excluded.country_code,
  description = excluded.description,
  colour = excluded.colour,
  updated_at = now();
insert into public.data_api_providers (
  api_provider_id,
  api_provider_name,
  description,
  link,
  country_code,
  status,
  colour,
  privacy_policy_url,
  terms_of_service_url,
  prompt_training_policy,
  prompt_training_notes,
  prompt_training_source_url
)
values (
  'x-ai',
  'xAI',
  null,
  'https://docs.x.ai/docs/overview',
  'US',
  'Active',
  '#000000',
  'https://x.ai/privacy-policy',
  'https://x.ai/legal/terms-of-service-enterprise/',
  'no_train',
  'xAI says business data, including inputs and outputs, is not used to train its models for enterprise/API customers.',
  'https://x.ai/legal/faq-enterprise'
)
on conflict (api_provider_id) do update set
  api_provider_name = excluded.api_provider_name,
  description = excluded.description,
  link = excluded.link,
  country_code = excluded.country_code,
  status = excluded.status,
  colour = excluded.colour,
  privacy_policy_url = excluded.privacy_policy_url,
  terms_of_service_url = excluded.terms_of_service_url,
  prompt_training_policy = excluded.prompt_training_policy,
  prompt_training_notes = excluded.prompt_training_notes,
  prompt_training_source_url = excluded.prompt_training_source_url,
  updated_at = now();
insert into public.data_models (
  model_id,
  name,
  description,
  organisation_id,
  status,
  announcement_date,
  release_date,
  deprecation_date,
  retirement_date,
  license,
  input_types,
  output_types,
  previous_model_id,
  hidden
)
values
  (
    'google/gemini-3.1-flash-live-preview',
    'Gemini 3.1 Flash Live Preview',
    'Gemini 3.1 Flash Live Preview is a Google Live API realtime voice model for low-latency bidirectional audio conversations.',
    'google',
    'Available',
    '2026-03-01T00:00:00Z',
    '2026-03-01T00:00:00Z',
    null,
    null,
    'Proprietary',
    'text,audio',
    'text,audio',
    null,
    false
  ),
  (
    'x-ai/grok-voice-latest',
    'Grok Voice Latest',
    'Grok Voice Latest is xAI''s realtime voice model for low-latency bidirectional audio conversations.',
    'x-ai',
    'Available',
    '2026-04-23T00:00:00Z',
    '2026-04-23T00:00:00Z',
    null,
    null,
    'Proprietary',
    'text,audio',
    'text,audio',
    null,
    false
  )
on conflict (model_id) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  announcement_date = excluded.announcement_date,
  release_date = excluded.release_date,
  deprecation_date = excluded.deprecation_date,
  retirement_date = excluded.retirement_date,
  license = excluded.license,
  input_types = excluded.input_types,
  output_types = excluded.output_types,
  previous_model_id = excluded.previous_model_id,
  hidden = excluded.hidden,
  updated_at = now();
insert into public.data_model_links (model_id, platform, url)
values
  ('google/gemini-3.1-flash-live-preview', 'api_reference', 'https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket'),
  ('x-ai/grok-voice-latest', 'api_reference', 'https://docs.x.ai/developers/model-capabilities/audio/voice-agent')
on conflict do nothing;
insert into public.data_model_details (model_id, detail_name, detail_value)
values
  (
    'google/gemini-3.1-flash-live-preview',
    'release_note',
    'Google''s model card exposes month-level recency only: Latest update March 2026. AI Stats stores 2026-03-01 for sortable catalog display.'
  ),
  (
    'x-ai/grok-voice-latest',
    'alias_target',
    'grok-voice-think-fast-1.0'
  ),
  (
    'x-ai/grok-voice-latest',
    'release_note',
    'xAI documents grok-voice-latest as an alias to the newest voice model, currently grok-voice-think-fast-1.0. AI Stats stores the current target release date from xAI release notes.'
  )
on conflict do nothing;
insert into public.data_api_provider_models (
  provider_api_model_id,
  provider_id,
  api_model_id,
  provider_model_slug,
  internal_model_id,
  is_active_gateway,
  input_modalities,
  output_modalities,
  quantization_scheme,
  context_length,
  max_output_tokens,
  effective_from,
  effective_to
)
values
  (
    'google-ai-studio:google/gemini-3.1-flash-live-preview',
    'google-ai-studio',
    'google/gemini-3.1-flash-live-preview',
    'gemini-3.1-flash-live-preview',
    'google/gemini-3.1-flash-live-preview',
    true,
    array['text', 'audio'],
    array['text', 'audio'],
    null,
    null,
    null,
    '2026-03-01T00:00:00Z',
    null
  ),
  (
    'x-ai:x-ai/grok-voice-latest',
    'x-ai',
    'x-ai/grok-voice-latest',
    'grok-voice-latest',
    'x-ai/grok-voice-latest',
    true,
    array['text', 'audio'],
    array['text', 'audio'],
    null,
    null,
    null,
    '2026-04-23T00:00:00Z',
    null
  )
on conflict (provider_api_model_id) do update set
  api_model_id = excluded.api_model_id,
  provider_model_slug = excluded.provider_model_slug,
  internal_model_id = excluded.internal_model_id,
  is_active_gateway = excluded.is_active_gateway,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  quantization_scheme = excluded.quantization_scheme,
  context_length = excluded.context_length,
  max_output_tokens = excluded.max_output_tokens,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  updated_at = now();
insert into public.data_api_provider_model_capabilities (
  provider_api_model_id,
  capability_id,
  max_input_tokens,
  max_output_tokens,
  params,
  status
)
values
  (
    'google-ai-studio:google/gemini-3.1-flash-live-preview',
    'audio.realtime',
    null,
    null,
    '{
      "voice": {
        "type": "enum",
        "default": "Puck",
        "values": [
          { "id": "Zephyr", "description": "Bright" },
          { "id": "Kore", "description": "Firm" },
          { "id": "Orus", "description": "Firm" },
          { "id": "Autonoe", "description": "Bright" },
          { "id": "Umbriel", "description": "Easy-going" },
          { "id": "Erinome", "description": "Clear" },
          { "id": "Laomedeia", "description": "Upbeat" },
          { "id": "Schedar", "description": "Even" },
          { "id": "Achird", "description": "Friendly" },
          { "id": "Sadachbia", "description": "Lively" },
          { "id": "Puck", "description": "Upbeat" },
          { "id": "Fenrir", "description": "Excitable" },
          { "id": "Aoede", "description": "Breezy" },
          { "id": "Enceladus", "description": "Breathy" },
          { "id": "Algieba", "description": "Smooth" },
          { "id": "Algenib", "description": "Gravelly" },
          { "id": "Achernar", "description": "Soft" },
          { "id": "Gacrux", "description": "Mature" },
          { "id": "Zubenelgenubi", "description": "Casual" },
          { "id": "Sadaltager", "description": "Knowledgeable" },
          { "id": "Charon", "description": "Informative" },
          { "id": "Leda", "description": "Youthful" },
          { "id": "Callirrhoe", "description": "Easy-going" },
          { "id": "Iapetus", "description": "Clear" },
          { "id": "Despina", "description": "Smooth" },
          { "id": "Rasalgethi", "description": "Informative" },
          { "id": "Alnilam", "description": "Firm" },
          { "id": "Pulcherrima", "description": "Forward" },
          { "id": "Vindemiatrix", "description": "Gentle" },
          { "id": "Sulafat", "description": "Warm" }
        ],
        "source_url": "https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/configure-language-voice"
      }
    }'::jsonb,
    'active'
  ),
  (
    'x-ai:x-ai/grok-voice-latest',
    'audio.realtime',
    null,
    null,
    '{
      "voice": {
        "type": "enum",
        "default": "eve",
        "supports_custom": true,
        "values": [
          { "id": "eve", "label": "Eve", "description": "Energetic, upbeat" },
          { "id": "ara", "label": "Ara", "description": "Warm, friendly" },
          { "id": "leo", "label": "Leo", "description": "Authoritative, strong" },
          { "id": "rex", "label": "Rex", "description": "Confident, clear" },
          { "id": "sal", "label": "Sal", "description": "Smooth, balanced" },
          { "id": "altair", "label": "Altair" },
          { "id": "atlas", "label": "Atlas" },
          { "id": "carina", "label": "Carina" },
          { "id": "castor", "label": "Castor" },
          { "id": "celeste", "label": "Celeste" },
          { "id": "cosmo", "label": "Cosmo" },
          { "id": "helios", "label": "Helios" },
          { "id": "helix", "label": "Helix" },
          { "id": "iris", "label": "Iris" },
          { "id": "kepler", "label": "Kepler" },
          { "id": "lumen", "label": "Lumen" },
          { "id": "luna", "label": "Luna" },
          { "id": "lux", "label": "Lux" },
          { "id": "naksh", "label": "Naksh" },
          { "id": "orion", "label": "Orion" },
          { "id": "perseus", "label": "Perseus" },
          { "id": "rigel", "label": "Rigel" },
          { "id": "sirius", "label": "Sirius" },
          { "id": "ursa", "label": "Ursa" },
          { "id": "zagan", "label": "Zagan" },
          { "id": "zenith", "label": "Zenith" }
        ],
        "source_url": "https://x.ai/api/voice"
      }
    }'::jsonb,
    'active'
  )
on conflict (provider_api_model_id, capability_id) do update set
  max_input_tokens = excluded.max_input_tokens,
  max_output_tokens = excluded.max_output_tokens,
  params = excluded.params,
  status = excluded.status,
  updated_at = now();
delete from public.data_api_pricing_rules
where model_key in (
  'google-ai-studio:google/gemini-3.1-flash-live-preview:audio.realtime',
  'x-ai:x-ai/grok-voice-latest:audio.realtime'
)
and capability_id = 'audio.realtime';
insert into public.data_api_pricing_rules (
  model_key,
  capability_id,
  pricing_plan,
  meter,
  unit,
  unit_size,
  price_per_unit,
  currency,
  note,
  match,
  priority,
  effective_from,
  effective_to
)
values
  ('google-ai-studio:google/gemini-3.1-flash-live-preview:audio.realtime', 'audio.realtime', 'standard', 'input_text_tokens', 'token', 1000000, 0.75, 'USD', 'Gemini 3.1 Flash Live Preview text input.', '[]'::jsonb, 100, '2026-03-01T00:00:00Z', null),
  ('google-ai-studio:google/gemini-3.1-flash-live-preview:audio.realtime', 'audio.realtime', 'standard', 'input_audio_tokens', 'token', 1000000, 3, 'USD', 'Gemini 3.1 Flash Live Preview audio input.', '[]'::jsonb, 100, '2026-03-01T00:00:00Z', null),
  ('google-ai-studio:google/gemini-3.1-flash-live-preview:audio.realtime', 'audio.realtime', 'standard', 'output_text_tokens', 'token', 1000000, 4.5, 'USD', 'Gemini 3.1 Flash Live Preview text output, including thinking tokens.', '[]'::jsonb, 100, '2026-03-01T00:00:00Z', null),
  ('google-ai-studio:google/gemini-3.1-flash-live-preview:audio.realtime', 'audio.realtime', 'standard', 'output_audio_tokens', 'token', 1000000, 12, 'USD', 'Gemini 3.1 Flash Live Preview audio output.', '[]'::jsonb, 100, '2026-03-01T00:00:00Z', null),
  ('x-ai:x-ai/grok-voice-latest:audio.realtime', 'audio.realtime', 'standard', 'audio_minutes', 'minute', 1, 0.05, 'USD', 'Realtime voice flat audio duration billing.', '[]'::jsonb, 100, '2026-04-23T00:00:00Z', null),
  ('x-ai:x-ai/grok-voice-latest:audio.realtime', 'audio.realtime', 'standard', 'input_text_messages', 'message', 1, 0.004, 'USD', 'Realtime text input message billing.', '[]'::jsonb, 100, '2026-04-23T00:00:00Z', null);

