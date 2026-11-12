CREATE OR REPLACE FUNCTION public.get_private_usage_overview (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_bucket       text                     DEFAULT NULL::text,
  p_time_zone    text                     DEFAULT 'UTC'::text,
  p_key_id       uuid                     DEFAULT NULL::uuid,
  p_exclude_key  boolean                  DEFAULT false,
  p_creator_id   uuid                     DEFAULT NULL::uuid,
  p_label_key    text                     DEFAULT NULL::text,
  p_label_value  text                     DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- Exact usage overview figures for a workspace from p_from to p_to inclusive: one entry
-- per time bucket (5 minutes, or an hour, day or month in p_time_zone; none when
-- p_bucket is null), model, provider, key, app and BYOK. With a label, only requests
-- carrying it.
-- Whole quarter hours come from v2_private_usage_15m, or v2_private_usage_labels_15m
-- for a label. The minutes outside them, the latest half hour, and any hour the outbox
-- processor has yet to rebuild come from v2_usage_overview_requests, which the rollups
-- are built from. 5-minute buckets read requests only.
-- Service role only: the account routes check workspace membership before calling it.
with stale_hours as (
  -- UTC hours whose rollup rows may be missing or out of date: the processor rebuilds
  -- whole workspace hours, for pending or failed events and for hours a corrected
  -- request moved out of. 'processing' is only set inside its own transaction.
  select date_trunc('hour', outbox.occurred_at, 'UTC') as hour_start
  from public.v2_analytics_outbox outbox
  where outbox.workspace_id = p_workspace_id
    and outbox.status in ('pending', 'failed')
    and outbox.occurred_at >= p_from - interval '1 hour'
    and outbox.occurred_at <= p_to
  union
  select date_trunc('hour', previous.occurred_at, 'UTC')
  from private.v2_analytics_previous_grains previous
  where previous.workspace_id = p_workspace_id
    and previous.occurred_at >= p_from - interval '1 hour'
    and previous.occurred_at <= p_to
),
bounds as (
  select
    rolled.rolled_from,
    rolled.rolled_to,
    rolled.rolled_from is not null and rolled.rolled_to > rolled.rolled_from as use_rollup
  from (
    select
      case when p_bucket is distinct from '5 minutes'
        then date_bin('15 minutes', p_from - interval '1 microsecond', timestamptz '2000-01-01 00:00:00+00') + interval '15 minutes'
      end as rolled_from,
      date_bin('15 minutes', p_to, timestamptz '2000-01-01 00:00:00+00') - interval '15 minutes' as rolled_to
  ) rolled
),
raw_ranges as (
  select p_from as range_from, p_to + interval '1 microsecond' as range_to from bounds where not bounds.use_rollup
  union all
  select p_from, bounds.rolled_from from bounds where bounds.use_rollup and bounds.rolled_from > p_from
  union all
  select bounds.rolled_to, p_to + interval '1 microsecond' from bounds where bounds.use_rollup
  union all
  select greatest(stale.hour_start, bounds.rolled_from), least(stale.hour_start + interval '1 hour', bounds.rolled_to)
  from bounds
  join stale_hours stale
    on stale.hour_start < bounds.rolled_to
    and stale.hour_start + interval '1 hour' > bounds.rolled_from
  where bounds.use_rollup
),
usage_rows as (
  select
    request.occurred_at as at,
    request.model_id,
    request.provider_model_id,
    request.key_id,
    request.app_id,
    request.byok,
    1::bigint as requests,
    request.successful::integer::bigint as successful_requests,
    request.guardrail_blocked::integer::bigint as guardrail_blocked,
    request.cost_nanos::numeric as cost_nanos,
    request.tokens,
    request.input_tokens,
    request.output_tokens,
    request.reasoning_tokens,
    request.cached_tokens
  from raw_ranges
  join private.v2_usage_overview_requests request
    on request.workspace_id = p_workspace_id
    and request.occurred_at >= raw_ranges.range_from
    and request.occurred_at < raw_ranges.range_to
  where p_label_key is null
    or request.labels @> jsonb_build_array(jsonb_build_object('key', p_label_key, 'value', p_label_value))
  union all
  select
    rollup.bucket_start, rollup.model_id, rollup.provider_model_id, rollup.key_id, rollup.app_id, rollup.byok,
    rollup.requests, rollup.successful_requests, rollup.guardrail_blocked, rollup.cost_nanos,
    rollup.tokens, rollup.input_tokens, rollup.output_tokens, rollup.reasoning_tokens, rollup.cached_tokens
  from bounds
  join public.v2_private_usage_15m rollup
    on rollup.workspace_id = p_workspace_id
    and rollup.bucket_start >= bounds.rolled_from
    and rollup.bucket_start < bounds.rolled_to
  where bounds.use_rollup and p_label_key is null
    and not exists (select 1 from stale_hours stale where stale.hour_start = date_trunc('hour', rollup.bucket_start, 'UTC'))
  union all
  select
    rollup.bucket_start, rollup.model_id, rollup.provider_model_id, rollup.key_id, rollup.app_id, rollup.byok,
    rollup.requests, rollup.successful_requests, rollup.guardrail_blocked, rollup.cost_nanos,
    rollup.tokens, rollup.input_tokens, rollup.output_tokens, rollup.reasoning_tokens, rollup.cached_tokens
  from bounds
  join public.v2_private_usage_labels_15m rollup
    on rollup.workspace_id = p_workspace_id
    and rollup.label_key = p_label_key
    and rollup.label_value = p_label_value
    and rollup.bucket_start >= bounds.rolled_from
    and rollup.bucket_start < bounds.rolled_to
  where bounds.use_rollup and p_label_key is not null
    and not exists (select 1 from stale_hours stale where stale.hour_start = date_trunc('hour', rollup.bucket_start, 'UTC'))
),
filtered as (
  select usage_rows.*
  from usage_rows
  where (p_key_id is null or case when p_exclude_key
      then usage_rows.key_id is distinct from p_key_id
      else usage_rows.key_id = p_key_id end)
    and (p_creator_id is null or exists (
      select 1 from public.keys key
      where key.id = usage_rows.key_id
        and key.workspace_id = p_workspace_id
        and key.created_by = p_creator_id
    ))
)
select coalesce(jsonb_agg(jsonb_build_object(
  'bucket', cell.bucket,
  'modelId', cell.model_id,
  'provider', cell.provider,
  'keyId', cell.key_id,
  'appId', cell.app_id,
  'byok', cell.byok,
  'requests', cell.requests,
  'successfulRequests', cell.successful_requests,
  'guardrailBlocked', cell.guardrail_blocked,
  'costNanos', cell.cost_nanos,
  'tokens', cell.tokens,
  'inputTokens', cell.input_tokens,
  'outputTokens', cell.output_tokens,
  'reasoningTokens', cell.reasoning_tokens,
  'cachedTokens', cell.cached_tokens
) order by cell.bucket, cell.requests desc), '[]'::jsonb)
from (
  select
    case p_bucket
      when '5 minutes' then date_bin('5 minutes', filtered.at, timestamptz '2000-01-01 00:00:00+00')
      when 'hour' then date_trunc('hour', filtered.at, p_time_zone)
      when 'day' then date_trunc('day', filtered.at, p_time_zone)
      when 'month' then date_trunc('month', filtered.at, p_time_zone)
    end as bucket,
    filtered.model_id,
    route.provider_slug as provider,
    filtered.key_id,
    filtered.app_id,
    filtered.byok,
    sum(filtered.requests) as requests,
    sum(filtered.successful_requests) as successful_requests,
    sum(filtered.guardrail_blocked) as guardrail_blocked,
    round(sum(filtered.cost_nanos)) as cost_nanos,
    round(sum(filtered.tokens)) as tokens,
    round(sum(filtered.input_tokens)) as input_tokens,
    round(sum(filtered.output_tokens)) as output_tokens,
    round(sum(filtered.reasoning_tokens)) as reasoning_tokens,
    round(sum(filtered.cached_tokens)) as cached_tokens
  from filtered
  left join public.v2_model_provider_routes route on route.provider_model_id = filtered.provider_model_id
  group by 1, 2, 3, 4, 5, 6
) cell;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, text, text) FROM PUBLIC, "anon", "authenticated";
