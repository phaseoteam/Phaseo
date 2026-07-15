-- Correct Grok Voice Latest release metadata.
-- xAI documents grok-voice-latest as an alias to the current newest voice model:
-- grok-voice-think-fast-1.0, released on Apr 23, 2026.

update public.data_models
set announcement_date = '2026-04-23T00:00:00Z',
    release_date = '2026-04-23T00:00:00Z',
    updated_at = now()
where model_id = 'x-ai/grok-voice-latest';
insert into public.data_model_details (model_id, detail_name, detail_value)
select *
from (
  values
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
) as details(model_id, detail_name, detail_value)
where exists (
  select 1
  from public.data_models
  where data_models.model_id = details.model_id
)
and not exists (
  select 1
  from public.data_model_details existing
  where existing.model_id = details.model_id
    and existing.detail_name = details.detail_name
    and existing.detail_value = details.detail_value
);
update public.data_api_provider_models
set effective_from = '2026-04-23T00:00:00Z',
    updated_at = now()
where provider_api_model_id = 'x-ai:x-ai/grok-voice-latest';
update public.data_api_pricing_rules
set effective_from = '2026-04-23T00:00:00Z',
    updated_at = now()
where model_key = 'x-ai:x-ai/grok-voice-latest:audio.realtime'
  and capability_id = 'audio.realtime';

