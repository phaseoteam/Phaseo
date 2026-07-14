with free_variant_map(provider_id, internal_model_id, api_model_id, effective_from, effective_to) as (
  values
    ('cohere', 'cohere/north-mini-code-1-0', 'cohere/north-mini-code-1-0:free', null::timestamptz, null::timestamptz),
    ('google-ai-studio', 'google/gemma-3-12b', 'google/gemma-3-12b:free', '2025-03-12T00:00:00Z'::timestamptz, '2026-04-12T00:00:00Z'::timestamptz),
    ('google-ai-studio', 'google/gemma-3-1b', 'google/gemma-3-1b:free', '2025-03-12T00:00:00Z'::timestamptz, '2026-04-12T00:00:00Z'::timestamptz),
    ('google-ai-studio', 'google/gemma-3-27b', 'google/gemma-3-27b:free', '2025-03-12T00:00:00Z'::timestamptz, '2026-04-12T00:00:00Z'::timestamptz),
    ('google-ai-studio', 'google/gemma-3-4b', 'google/gemma-3-4b:free', '2025-03-12T00:00:00Z'::timestamptz, '2026-04-12T00:00:00Z'::timestamptz),
    ('google-ai-studio', 'google/gemma-3n-e2b', 'google/gemma-3n-e2b:free', '2025-06-25T00:00:00Z'::timestamptz, '2026-04-12T00:00:00Z'::timestamptz),
    ('google-ai-studio', 'google/gemma-3n-e4b', 'google/gemma-3n-e4b:free', '2025-06-25T00:00:00Z'::timestamptz, '2026-04-12T00:00:00Z'::timestamptz),
    ('google-ai-studio', 'google/gemma-4-26b-a4b', 'google/gemma-4-26b-a4b:free', '2026-04-02T00:00:00Z'::timestamptz, null::timestamptz),
    ('google-ai-studio', 'google/gemma-4-31b', 'google/gemma-4-31b:free', '2026-04-02T00:00:00Z'::timestamptz, null::timestamptz),
    ('mistral', 'mistral/devstral-small-2.0', 'mistral/devstral-small-2:free', null::timestamptz, '2026-03-31T00:00:00Z'::timestamptz),
    ('mistral', 'mistral/leanstral', 'mistral/leanstral:free', '2026-03-16T00:00:00Z'::timestamptz, '2026-05-22T00:00:00Z'::timestamptz),
    ('poolside', 'poolside/laguna-m.1', 'poolside/laguna-m.1:free', '2026-04-28T00:00:00Z'::timestamptz, null::timestamptz),
    ('poolside', 'poolside/laguna-xs.2', 'poolside/laguna-xs.2:free', '2026-04-28T00:00:00Z'::timestamptz, null::timestamptz),
    ('siliconflow', 'nex-agi/nex-n2-pro', 'nex-agi/nex-n2-pro:free', '2026-06-05T00:00:00Z'::timestamptz, '2026-06-19T00:00:00Z'::timestamptz),
    ('xiaomi', 'xiaomi/mimo-v2-flash', 'xiaomi/mimo-v2-flash:free', '2025-12-16T00:00:00Z'::timestamptz, '2026-01-24T16:00:00Z'::timestamptz),
    ('xiaomi', 'xiaomi/mimo-v2-tts', 'xiaomi/mimo-v2-tts:free', '2026-03-18T00:00:00Z'::timestamptz, null::timestamptz),
    ('xiaomi', 'xiaomi/mimo-v2.5-tts', 'xiaomi/mimo-v2.5-tts:free', '2026-04-22T00:00:00Z'::timestamptz, null::timestamptz),
    ('z-ai', 'z-ai/glm-4.7-flash', 'z-ai/glm-4-7-flash:free', '2026-01-19T00:00:00Z'::timestamptz, null::timestamptz)
),
matched_requests as (
  select
    gr.id,
    m.provider_id,
    m.internal_model_id,
    m.api_model_id
  from public.gateway_requests gr
  join free_variant_map m
    on lower(m.internal_model_id) in (
      lower(coalesce(gr.api_model_id, '')),
      lower(coalesce(gr.routed_model_id, '')),
      lower(coalesce(gr.model_id, '')),
      lower(coalesce(gr.requested_model_id, '')),
      lower(coalesce(gr.canonical_model_id, ''))
    )
   and (m.effective_from is null or gr.created_at >= m.effective_from)
   and (m.effective_to is null or gr.created_at < m.effective_to)
   and (
     gr.provider is null
     or gr.provider = ''
     or lower(gr.provider) = lower(m.provider_id)
   )
   and m.provider_id = 'poolside'
  where not (
    lower(coalesce(gr.api_model_id, '')) like '%:free'
    or lower(coalesce(gr.routed_model_id, '')) like '%:free'
    or lower(coalesce(gr.model_id, '')) like '%:free'
    or lower(coalesce(gr.requested_model_id, '')) like '%:free'
    or lower(coalesce(gr.canonical_model_id, '')) like '%:free'
  )
)
update public.gateway_requests gr
set
  provider = coalesce(nullif(gr.provider, ''), mr.provider_id),
  model_id = case
    when gr.model_id is null or gr.model_id = '' or lower(gr.model_id) = lower(mr.internal_model_id)
      then mr.api_model_id
    else gr.model_id
  end,
  canonical_model_id = mr.api_model_id,
  requested_model_id = case
    when gr.requested_model_id is null or gr.requested_model_id = '' or lower(gr.requested_model_id) = lower(mr.internal_model_id)
      then mr.api_model_id
    else gr.requested_model_id
  end,
  routed_model_id = case
    when gr.routed_model_id is null or gr.routed_model_id = '' or lower(gr.routed_model_id) = lower(mr.internal_model_id)
      then mr.api_model_id
    else gr.routed_model_id
  end,
  api_model_id = mr.api_model_id,
  pricing_plan = 'free',
  is_free_variant = true
from matched_requests mr
where gr.id = mr.id;

select public.refresh_public_leaderboard_rollups('2026-04-28T00:00:00Z'::timestamptz, now());
select public.refresh_public_model_user_usage_daily('2026-04-28T00:00:00Z'::timestamptz, now());
notify pgrst, 'reload schema';
