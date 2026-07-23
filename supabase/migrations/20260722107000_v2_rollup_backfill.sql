-- v2 initial usage/performance rollup backfill.

insert into public.v2_private_usage_daily (
  usage_date, workspace_id, app_id, model_slug, provider_model_id,
  requests, successful_requests, failed_requests, rate_limited_requests,
  tool_call_count, structured_output_attempts, structured_output_successes,
  latency_sum_ms, latency_count, generation_sum_ms, generation_count,
  throughput_sum, throughput_count
)
select
  fact.occurred_at::date,
  fact.workspace_id,
  fact.app_id,
  coalesce(fact.routed_model_slug, fact.requested_model_slug),
  fact.provider_model_id,
  count(*),
  count(*) filter (where fact.success),
  count(*) filter (where not fact.success),
  count(*) filter (where fact.status_code = 429),
  sum(fact.tool_call_count),
  count(*) filter (where fact.structured_output_attempted),
  count(*) filter (where fact.structured_output_succeeded),
  coalesce(sum(fact.latency_ms), 0),
  count(fact.latency_ms),
  coalesce(sum(fact.generation_ms), 0),
  count(fact.generation_ms),
  coalesce(sum(fact.throughput), 0),
  count(fact.throughput)
from public.v2_request_facts fact
where coalesce(fact.routed_model_slug, fact.requested_model_slug) is not null
group by 1, 2, 3, 4, 5;

insert into public.v2_public_usage_daily (
  usage_date, app_id, model_slug, provider_model_id,
  requests, successful_requests, failed_requests, rate_limited_requests,
  tool_call_count, structured_output_attempts, structured_output_successes,
  latency_sum_ms, latency_count, generation_sum_ms, generation_count,
  throughput_sum, throughput_count
)
select
  fact.occurred_at::date,
  fact.app_id,
  coalesce(fact.routed_model_slug, fact.requested_model_slug),
  fact.provider_model_id,
  count(*),
  count(*) filter (where fact.success),
  count(*) filter (where not fact.success),
  count(*) filter (where fact.status_code = 429),
  sum(fact.tool_call_count),
  count(*) filter (where fact.structured_output_attempted),
  count(*) filter (where fact.structured_output_succeeded),
  coalesce(sum(fact.latency_ms), 0),
  count(fact.latency_ms),
  coalesce(sum(fact.generation_ms), 0),
  count(fact.generation_ms),
  coalesce(sum(fact.throughput), 0),
  count(fact.throughput)
from public.v2_request_facts fact
where coalesce(fact.routed_model_slug, fact.requested_model_slug) is not null
group by 1, 2, 3, 4;

insert into public.v2_public_usage_hourly (
  bucket_start, app_id, model_slug, provider_model_id,
  requests, successful_requests, failed_requests, rate_limited_requests,
  tool_call_count, structured_output_attempts, structured_output_successes,
  latency_sum_ms, latency_count, generation_sum_ms, generation_count,
  throughput_sum, throughput_count
)
select
  date_trunc('hour', fact.occurred_at),
  fact.app_id,
  coalesce(fact.routed_model_slug, fact.requested_model_slug),
  fact.provider_model_id,
  count(*),
  count(*) filter (where fact.success),
  count(*) filter (where not fact.success),
  count(*) filter (where fact.status_code = 429),
  sum(fact.tool_call_count),
  count(*) filter (where fact.structured_output_attempted),
  count(*) filter (where fact.structured_output_succeeded),
  coalesce(sum(fact.latency_ms), 0),
  count(fact.latency_ms),
  coalesce(sum(fact.generation_ms), 0),
  count(fact.generation_ms),
  coalesce(sum(fact.throughput), 0),
  count(fact.throughput)
from public.v2_request_facts fact
where coalesce(fact.routed_model_slug, fact.requested_model_slug) is not null
group by 1, 2, 3, 4;

insert into public.v2_rollup_refresh_state (
  rollup_name, bucket_start, last_completed_at, source_watermark, status
)
select
  'private_daily', occurred_at::date::timestamptz, now(), max(occurred_at), 'complete'
from public.v2_request_facts
group by occurred_at::date
on conflict (rollup_name, bucket_start) do update set
  last_completed_at = excluded.last_completed_at,
  source_watermark = excluded.source_watermark,
  status = excluded.status,
  updated_at = now();

insert into public.v2_rollup_refresh_state (
  rollup_name, bucket_start, last_completed_at, source_watermark, status
)
select
  'public_hourly', date_trunc('hour', occurred_at), now(), max(occurred_at), 'complete'
from public.v2_request_facts
group by date_trunc('hour', occurred_at)
on conflict (rollup_name, bucket_start) do update set
  last_completed_at = excluded.last_completed_at,
  source_watermark = excluded.source_watermark,
  status = excluded.status,
  updated_at = now();
