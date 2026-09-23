-- Publish Gemini 3.8 TTS availability and official Google pricing.

create temporary table _gemini_38_tts_prices (
  model_slug text not null,
  tier_slug text not null,
  price_period text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  input_usd numeric not null,
  output_usd numeric not null,
  cache_usd numeric not null,
  storage_usd numeric not null
) on commit drop;

insert into _gemini_38_tts_prices values
  ('google/gemini-3.8-flash-tts',      'standard', 'introductory', '2026-09-23 00:00:00+00', '2027-01-01 00:00:00+00', 0.50,  9.00, 0.1250, 0.50),
  ('google/gemini-3.8-flash-tts',      'batch',    'introductory', '2026-09-23 00:00:00+00', '2027-01-01 00:00:00+00', 0.25,  4.50, 0.0625, 0.50),
  ('google/gemini-3.8-flash-tts',      'flex',     'introductory', '2026-09-23 00:00:00+00', '2027-01-01 00:00:00+00', 0.25,  4.50, 0.0250, 0.50),
  ('google/gemini-3.8-flash-tts',      'priority', 'introductory', '2026-09-23 00:00:00+00', '2027-01-01 00:00:00+00', 0.90, 16.20, 0.2250, 0.50),
  ('google/gemini-3.8-flash-tts',      'standard', '2027',         '2027-01-01 00:00:00+00', null,                         1.00, 18.00, 0.2500, 1.00),
  ('google/gemini-3.8-flash-tts',      'batch',    '2027',         '2027-01-01 00:00:00+00', null,                         0.50,  9.00, 0.1250, 1.00),
  ('google/gemini-3.8-flash-tts',      'flex',     '2027',         '2027-01-01 00:00:00+00', null,                         0.50,  9.00, 0.0500, 1.00),
  ('google/gemini-3.8-flash-tts',      'priority', '2027',         '2027-01-01 00:00:00+00', null,                         1.80, 32.40, 0.4500, 1.00),
  ('google/gemini-3.8-flash-lite-tts', 'standard', 'introductory', '2026-09-23 00:00:00+00', '2027-01-01 00:00:00+00', 0.50,  6.00, 0.1250, 0.50),
  ('google/gemini-3.8-flash-lite-tts', 'batch',    'introductory', '2026-09-23 00:00:00+00', '2027-01-01 00:00:00+00', 0.25,  3.00, 0.0625, 0.50),
  ('google/gemini-3.8-flash-lite-tts', 'flex',     'introductory', '2026-09-23 00:00:00+00', '2027-01-01 00:00:00+00', 0.25,  3.00, 0.0250, 0.50),
  ('google/gemini-3.8-flash-lite-tts', 'priority', 'introductory', '2026-09-23 00:00:00+00', '2027-01-01 00:00:00+00', 0.90, 10.80, 0.2250, 0.50),
  ('google/gemini-3.8-flash-lite-tts', 'standard', '2027',         '2027-01-01 00:00:00+00', null,                         1.00, 12.00, 0.2500, 1.00),
  ('google/gemini-3.8-flash-lite-tts', 'batch',    '2027',         '2027-01-01 00:00:00+00', null,                         0.50,  6.00, 0.1250, 1.00),
  ('google/gemini-3.8-flash-lite-tts', 'flex',     '2027',         '2027-01-01 00:00:00+00', null,                         0.50,  6.00, 0.0500, 1.00),
  ('google/gemini-3.8-flash-lite-tts', 'priority', '2027',         '2027-01-01 00:00:00+00', null,                         1.80, 21.60, 0.4500, 1.00);

update public.v2_models
set
  status = 'active',
  catalogue_status = 'available',
  announced_at = '2026-09-23 00:00:00+00',
  released_at = '2026-09-23 00:00:00+00',
  description = case model_slug
    when 'google/gemini-3.8-flash-tts' then 'A text-to-speech audio model engineered for studio-grade voice fidelity, expressive acting, and long-form stability.'
    else 'A text-to-speech audio model optimized for high-throughput, low-latency, and cost-efficient conversational speech.'
  end,
  metadata = metadata || jsonb_build_object(
    'public_launch_date', '2026-09-23',
    'verification', jsonb_build_object('status', 'verified', 'checked_at', '2026-09-23T00:00:00Z', 'notes', 'Public availability and pricing verified on the official Gemini Developer API pricing page.'),
    'pricing_source', jsonb_build_object('url', 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts', 'accessed_at', '2026-09-23T00:00:00Z')
  ),
  updated_at = now()
where model_slug in ('google/gemini-3.8-flash-tts', 'google/gemini-3.8-flash-lite-tts');

update public.v2_model_provider_routes
set
  status = 'active',
  provider_availability_status = 'available',
  phaseo_status = 'enabled',
  routing_enabled = true,
  effective_from = '2026-09-23 00:00:00+00',
  metadata = (metadata - 'routing_blocker') || jsonb_build_object(
    'routable', true,
    'routing_status', 'active',
    'verification', jsonb_build_object('status', 'verified', 'checked_at', '2026-09-23T00:00:00Z', 'notes', 'Public availability and pricing verified on the official Gemini Developer API pricing page.'),
    'pricing_source', jsonb_build_object('url', 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts', 'accessed_at', '2026-09-23T00:00:00Z'),
    'service_tiers', jsonb_build_array('standard', 'batch', 'flex', 'priority')
  ),
  updated_at = now()
where provider_model_id in ('google-ai-studio:google/gemini-3.8-flash-tts', 'google-ai-studio:google/gemini-3.8-flash-lite-tts');

insert into public.v2_pricing_skus (
  sku_id, provider_model_id, sku_code, version, operation, status, region,
  display_name, description, currency, effective_from, effective_to, metadata,
  service_tier_slug
)
select
  gen_random_uuid(),
  'google-ai-studio:' || price.model_slug,
  replace('google-ai-studio:' || price.model_slug || ':audio.speech:' || price.tier_slug || ':' || price.price_period, '/', '-'),
  1,
  'audio.speech',
  'active',
  null,
  case price.model_slug when 'google/gemini-3.8-flash-tts' then 'Gemini 3.8 Flash TTS' else 'Gemini 3.8 Flash-Lite TTS' end || ' ' || initcap(price.tier_slug),
  case price.price_period when 'introductory' then 'Google introductory pricing through December 31, 2026.' else 'Scheduled Google pricing from January 1, 2027.' end,
  'USD',
  price.starts_at,
  price.ends_at,
  jsonb_build_object(
    'source', 'official_provider_pricing',
    'source_url', 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts',
    'accessed_at', '2026-09-23T00:00:00Z',
    'priority', 200,
    'price_period', price.price_period,
    'cache_storage_usd_per_million_token_hour', price.storage_usd,
    'cache_storage_note', 'Google bills cache storage per 1,000,000 tokens per hour.',
    'billing_timestamp_basis', 'request_start',
    'time_windows', jsonb_build_array()
  ),
  price.tier_slug
from _gemini_38_tts_prices price
on conflict (provider_model_id, sku_code, version) do update
set
  operation = excluded.operation,
  status = excluded.status,
  display_name = excluded.display_name,
  description = excluded.description,
  currency = excluded.currency,
  effective_from = excluded.effective_from,
  effective_to = excluded.effective_to,
  metadata = excluded.metadata,
  service_tier_slug = excluded.service_tier_slug,
  updated_at = now();

insert into public.v2_pricing_sku_meters (
  sku_meter_id, sku_id, meter_key, modality, direction, unit, unit_quantity,
  price_nanos, display_label, display_unit, billable, meter_order, metadata
)
select
  gen_random_uuid(),
  sku.sku_id,
  meter.meter_key,
  meter.modality,
  meter.direction,
  'token',
  1000000,
  meter.usd * 1000000000,
  meter.display_label,
  '1M tokens',
  true,
  meter.meter_order,
  jsonb_build_object(
    'source', 'official_provider_pricing',
    'source_url', 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts',
    'note', case price.price_period when 'introductory' then 'Google introductory pricing through December 31, 2026.' else 'Scheduled Google pricing from January 1, 2027.' end,
    'priority', 200,
    'billing_timestamp_basis', 'request_start',
    'time_windows', jsonb_build_array()
  )
from _gemini_38_tts_prices price
join public.v2_pricing_skus sku
  on sku.provider_model_id = 'google-ai-studio:' || price.model_slug
 and sku.sku_code = replace('google-ai-studio:' || price.model_slug || ':audio.speech:' || price.tier_slug || ':' || price.price_period, '/', '-')
 and sku.version = 1
cross join lateral (values
  ('input_text_tokens', 'text', 'input', price.input_usd, 'Input text tokens', 100),
  ('output_audio_tokens', 'audio', 'output', price.output_usd, 'Output audio tokens', 200),
  ('cached_read_text_tokens', 'text', 'input', price.cache_usd, 'Cached input text tokens', 300)
) meter(meter_key, modality, direction, usd, display_label, meter_order)
on conflict (sku_id, meter_key) do update
set
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
