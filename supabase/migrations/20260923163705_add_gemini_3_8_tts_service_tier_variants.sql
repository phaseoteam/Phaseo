-- Expose non-standard Gemini 3.8 TTS pricing through tier-filtered catalogue queries.
-- phaseo:allow-production-history-backfill reason: Applied directly to production before migration 20260923170000 merged; this file records the existing production history.

insert into public.v2_route_variants (
  variant_id,
  provider_model_id,
  variant_key,
  provider_region_id,
  execution_region,
  data_region,
  service_tier_slug,
  status,
  routing_enabled,
  endpoint_label,
  metadata
)
select
  gen_random_uuid(),
  route.provider_model_id,
  'global:' || tier.service_tier_slug,
  null,
  null,
  null,
  tier.service_tier_slug,
  'active',
  true,
  tier.service_tier_slug,
  jsonb_build_object(
    'scope', 'global',
    'source', 'official_provider_pricing',
    'source_url', 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts',
    'verified_at', '2026-09-23T00:00:00Z'
  )
from public.v2_model_provider_routes route
cross join (values ('batch'), ('flex'), ('priority')) tier(service_tier_slug)
where route.provider_model_id in (
  'google-ai-studio:google/gemini-3.8-flash-tts',
  'google-ai-studio:google/gemini-3.8-flash-lite-tts'
)
on conflict (provider_model_id, variant_key) do update
set
  service_tier_slug = excluded.service_tier_slug,
  status = excluded.status,
  routing_enabled = excluded.routing_enabled,
  endpoint_label = excluded.endpoint_label,
  metadata = excluded.metadata,
  updated_at = now();
