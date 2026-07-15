-- Add OpenAI GPT Realtime 2.1 catalog, provider, voice, and pricing rows.
-- Realtime session creation loads price cards from data_api_pricing_rules.

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
    'openai/gpt-realtime-2.1',
    'GPT Realtime 2.1',
    'GPT Realtime 2.1 is OpenAI''s realtime voice model for low-latency audio conversations.',
    'openai',
    'Available',
    '2026-07-06T00:00:00Z',
    '2026-07-06T00:00:00Z',
    null,
    null,
    'Proprietary',
    'text,image,audio',
    'text,audio',
    'openai/gpt-realtime-2',
    false
  ),
  (
    'openai/gpt-realtime-2.1-mini',
    'GPT Realtime 2.1 Mini',
    'GPT Realtime 2.1 Mini is OpenAI''s lower-cost realtime voice model for low-latency audio conversations.',
    'openai',
    'Available',
    '2026-07-06T00:00:00Z',
    '2026-07-06T00:00:00Z',
    null,
    null,
    'Proprietary',
    'text,image,audio',
    'text,audio',
    'openai/gpt-realtime-mini',
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
  (
    'openai/gpt-realtime-2.1',
    'api_reference',
    'https://developers.openai.com/api/docs/models/gpt-realtime-2.1'
  ),
  (
    'openai/gpt-realtime-2.1-mini',
    'api_reference',
    'https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini'
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
    'openai:openai/gpt-realtime-2.1',
    'openai',
    'openai/gpt-realtime-2.1',
    'gpt-realtime-2.1',
    'openai/gpt-realtime-2.1',
    true,
    array['text', 'image', 'audio'],
    array['text', 'audio'],
    null,
    128000,
    32000,
    '2026-07-06T00:00:00Z',
    null
  ),
  (
    'openai:openai/gpt-realtime-2.1-mini',
    'openai',
    'openai/gpt-realtime-2.1-mini',
    'gpt-realtime-2.1-mini',
    'openai/gpt-realtime-2.1-mini',
    true,
    array['text', 'image', 'audio'],
    array['text', 'audio'],
    null,
    128000,
    32000,
    '2026-07-06T00:00:00Z',
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
    'openai:openai/gpt-realtime-2.1',
    'audio.realtime',
    128000,
    32000,
    '{
      "voice": {
        "type": "enum",
        "default": "marin",
        "values": ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"],
        "source_url": "https://developers.openai.com/api/docs/guides/realtime-conversations"
      }
    }'::jsonb,
    'active'
  ),
  (
    'openai:openai/gpt-realtime-2.1-mini',
    'audio.realtime',
    128000,
    32000,
    '{
      "voice": {
        "type": "enum",
        "default": "marin",
        "values": ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"],
        "source_url": "https://developers.openai.com/api/docs/guides/realtime-conversations"
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
  'openai:openai/gpt-realtime-2.1:audio.realtime',
  'openai:openai/gpt-realtime-2.1-mini:audio.realtime'
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
  ('openai:openai/gpt-realtime-2.1:audio.realtime', 'audio.realtime', 'standard', 'input_text_tokens', 'token', 1000000, 4, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1:audio.realtime', 'audio.realtime', 'standard', 'cached_read_text_tokens', 'token', 1000000, 0.4, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1:audio.realtime', 'audio.realtime', 'standard', 'output_text_tokens', 'token', 1000000, 24, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1:audio.realtime', 'audio.realtime', 'standard', 'input_audio_tokens', 'token', 1000000, 32, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1:audio.realtime', 'audio.realtime', 'standard', 'cached_read_audio_tokens', 'token', 1000000, 0.4, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1:audio.realtime', 'audio.realtime', 'standard', 'output_audio_tokens', 'token', 1000000, 64, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1:audio.realtime', 'audio.realtime', 'standard', 'input_image_tokens', 'token', 1000000, 5, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1:audio.realtime', 'audio.realtime', 'standard', 'cached_read_image_tokens', 'token', 1000000, 0.5, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1-mini:audio.realtime', 'audio.realtime', 'standard', 'input_text_tokens', 'token', 1000000, 0.6, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1-mini:audio.realtime', 'audio.realtime', 'standard', 'cached_read_text_tokens', 'token', 1000000, 0.06, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1-mini:audio.realtime', 'audio.realtime', 'standard', 'output_text_tokens', 'token', 1000000, 2.4, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1-mini:audio.realtime', 'audio.realtime', 'standard', 'input_audio_tokens', 'token', 1000000, 10, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1-mini:audio.realtime', 'audio.realtime', 'standard', 'cached_read_audio_tokens', 'token', 1000000, 0.3, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1-mini:audio.realtime', 'audio.realtime', 'standard', 'output_audio_tokens', 'token', 1000000, 20, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1-mini:audio.realtime', 'audio.realtime', 'standard', 'input_image_tokens', 'token', 1000000, 0.8, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null),
  ('openai:openai/gpt-realtime-2.1-mini:audio.realtime', 'audio.realtime', 'standard', 'cached_read_image_tokens', 'token', 1000000, 0.08, 'USD', null, '[]'::jsonb, 100, '2026-07-06T00:00:00Z', null);

