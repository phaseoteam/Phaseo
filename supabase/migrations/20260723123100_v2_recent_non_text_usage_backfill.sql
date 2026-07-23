-- Complete the v2 usage-meter backfill for the recent window used by /models.
-- The original compatibility backfill projected token meters only, despite
-- normalized non-text usage already existing on gateway_requests.

insert into public.v2_request_usage (
  request_event_id,
  meter_key,
  modality,
  unit,
  quantity,
  source,
  billable,
  sequence
)
select
  fact.request_event_id,
  meter.meter_key,
  meter.modality,
  meter.unit,
  meter.quantity,
  'legacy_gateway_usage',
  true,
  meter.sequence
from public.gateway_requests request
join public.v2_request_facts fact
  on fact.workspace_id = request.workspace_id
  and fact.request_id = request.request_id
cross join lateral (
  values
    ('output_images', 'image', 'images', greatest(coalesce(request.usage_image_outputs, 0), 0)::numeric, 12),
    ('audio_seconds', 'audio', 'seconds', greatest(coalesce(request.usage_audio_seconds, 0), 0)::numeric, 30),
    ('output_video_seconds', 'video', 'seconds', greatest(coalesce(request.usage_video_seconds, 0), 0)::numeric, 31),
    ('input_characters', 'text', 'characters', greatest(coalesce(request.usage_input_characters, 0), 0)::numeric, 33),
    ('output_characters', 'text', 'characters', greatest(coalesce(request.usage_output_characters, 0), 0)::numeric, 34)
) as meter(meter_key, modality, unit, quantity, sequence)
where fact.occurred_at >= current_date - 6
  and fact.occurred_at < current_date + 1
  and meter.quantity > 0
  and not exists (
    select 1
    from public.v2_request_usage existing
    where existing.request_event_id = fact.request_event_id
      and existing.meter_key = meter.meter_key
  )
on conflict (request_event_id, meter_key, sequence) do update set
  modality = excluded.modality,
  unit = excluded.unit,
  quantity = excluded.quantity,
  source = excluded.source,
  billable = excluded.billable;

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
