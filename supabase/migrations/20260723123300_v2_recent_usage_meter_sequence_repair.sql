-- Repair rows written by the first recent non-text backfill, which used the
-- default sequence 0 rather than the gateway meter-definition sequence.

delete from public.v2_request_usage legacy
using public.v2_request_usage canonical
where legacy.request_event_id = canonical.request_event_id
  and legacy.meter_key = canonical.meter_key
  and legacy.sequence = 0
  and legacy.source = 'legacy_gateway_usage'
  and canonical.source <> 'legacy_gateway_usage'
  and legacy.meter_key in (
    'output_images',
    'audio_seconds',
    'output_video_seconds',
    'input_characters',
    'output_characters'
  );

update public.v2_request_usage usage
set sequence = case usage.meter_key
  when 'output_images' then 12
  when 'audio_seconds' then 30
  when 'output_video_seconds' then 31
  when 'input_characters' then 33
  when 'output_characters' then 34
end
where usage.sequence = 0
  and usage.source = 'legacy_gateway_usage'
  and usage.meter_key in (
    'output_images',
    'audio_seconds',
    'output_video_seconds',
    'input_characters',
    'output_characters'
  );

insert into public.v2_analytics_outbox (
  request_event_id,
  workspace_id,
  occurred_at,
  status,
  attempt_count,
  available_at,
  last_error,
  updated_at
)
select
  fact.request_event_id,
  fact.workspace_id,
  fact.occurred_at,
  'pending',
  0,
  now(),
  null,
  now()
from public.v2_request_facts fact
where fact.occurred_at >= current_date - 6
  and fact.occurred_at < current_date + 1
on conflict (request_event_id) do update set
  status = 'pending',
  attempt_count = 0,
  available_at = now(),
  last_error = null,
  updated_at = now();
