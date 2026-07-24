-- Populate meter dimensions for the initial v2 rollups.

insert into public.v2_private_usage_daily_meters (rollup_id, meter_key, modality, unit, quantity)
select
  rollup.rollup_id,
  usage.meter_key,
  usage.modality,
  usage.unit,
  sum(usage.quantity)
from public.v2_request_usage usage
join public.v2_request_facts fact on fact.request_event_id = usage.request_event_id
join public.v2_private_usage_daily rollup
  on rollup.usage_date = fact.occurred_at::date
 and rollup.workspace_id = fact.workspace_id
 and rollup.app_id is not distinct from fact.app_id
 and rollup.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
 and rollup.provider_model_id is not distinct from fact.provider_model_id
group by rollup.rollup_id, usage.meter_key, usage.modality, usage.unit;

insert into public.v2_public_usage_daily_meters (rollup_id, meter_key, modality, unit, quantity)
select
  rollup.rollup_id,
  usage.meter_key,
  usage.modality,
  usage.unit,
  sum(usage.quantity)
from public.v2_request_usage usage
join public.v2_request_facts fact on fact.request_event_id = usage.request_event_id
join public.v2_public_usage_daily rollup
  on rollup.usage_date = fact.occurred_at::date
 and rollup.app_id is not distinct from fact.app_id
 and rollup.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
 and rollup.provider_model_id is not distinct from fact.provider_model_id
group by rollup.rollup_id, usage.meter_key, usage.modality, usage.unit;

insert into public.v2_public_usage_hourly_meters (rollup_id, meter_key, modality, unit, quantity)
select
  rollup.rollup_id,
  usage.meter_key,
  usage.modality,
  usage.unit,
  sum(usage.quantity)
from public.v2_request_usage usage
join public.v2_request_facts fact on fact.request_event_id = usage.request_event_id
join public.v2_public_usage_hourly rollup
  on rollup.bucket_start = date_trunc('hour', fact.occurred_at)
 and rollup.app_id is not distinct from fact.app_id
 and rollup.model_slug = coalesce(fact.routed_model_slug, fact.requested_model_slug)
 and rollup.provider_model_id is not distinct from fact.provider_model_id
group by rollup.rollup_id, usage.meter_key, usage.modality, usage.unit;
