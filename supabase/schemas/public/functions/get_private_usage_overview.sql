CREATE OR REPLACE FUNCTION public.get_private_usage_overview (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_bucket       text                     DEFAULT NULL::text,
  p_time_zone    text                     DEFAULT 'UTC'::text,
  p_key_id       uuid                     DEFAULT NULL::uuid,
  p_exclude_key  boolean                  DEFAULT false,
  p_creator_id   uuid                     DEFAULT NULL::uuid,
  p_label        jsonb                    DEFAULT NULL::jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- Exact usage overview figures for a workspace from p_from to p_to inclusive: one entry
-- per time bucket (5 minutes, or an hour, day or month in p_time_zone; none when
-- p_bucket is null), model, provider, key, app and BYOK.
-- Whole quarter hours come from v2_private_usage_15m. The minutes outside them, and the
-- latest half hour, which the rollup may not have caught up with yet, come from the
-- requests, counted as process_v2_analytics_outbox counts them. Label filters and
-- 5-minute buckets need every request, so they read requests only.
-- Service role only: the account route checks workspace membership before calling it.
with bounds as (
  select
    rolled.rolled_from,
    rolled.rolled_to,
    rolled.rolled_from is not null and rolled.rolled_to > rolled.rolled_from as use_rollup
  from (
    select
      case when p_label is null and p_bucket is distinct from '5 minutes'
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
),
usage_rows as (
  select
    fact.occurred_at as at,
    coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input) as model_id,
    fact.provider_model_id,
    fact.key_id,
    fact.app_id,
    coalesce(fact.byok, false) as byok,
    1::bigint as requests,
    (fact.success is true)::integer::bigint as successful_requests,
    (fact.error_code like '%:guardrail_blocked')::integer::bigint as guardrail_blocked,
    coalesce(fact.cost_nanos, 0)::numeric as cost_nanos,
    coalesce(usage.total_tokens, usage.input_tokens + usage.output_tokens) as tokens,
    usage.input_tokens,
    usage.output_tokens,
    usage.reasoning_tokens,
    usage.cached_tokens
  from raw_ranges
  join public.v2_request_facts fact
    on fact.workspace_id = p_workspace_id
    and fact.occurred_at >= raw_ranges.range_from
    and fact.occurred_at < raw_ranges.range_to
  left join lateral (
    select
      coalesce(sum(meter.quantity) filter (where meter.meter_key = 'input_tokens'),
        sum(meter.quantity) filter (where meter.meter_key = 'prompt_tokens'),
        sum(meter.quantity) filter (where meter.meter_key = 'input_text_tokens'), 0) as input_tokens,
      coalesce(sum(meter.quantity) filter (where meter.meter_key = 'output_tokens'),
        sum(meter.quantity) filter (where meter.meter_key = 'completion_tokens'),
        sum(meter.quantity) filter (where meter.meter_key = 'output_text_tokens'), 0) as output_tokens,
      sum(meter.quantity) filter (where meter.meter_key = 'total_tokens') as total_tokens,
      coalesce(sum(meter.quantity) filter (where meter.meter_key in ('reasoning_tokens', 'output_reasoning_tokens')), 0) as reasoning_tokens,
      coalesce(sum(meter.quantity) filter (where meter.meter_key in ('cached_read_tokens', 'cached_input_tokens', 'cache_read_tokens', 'cached_read_text_tokens')), 0)
        + coalesce(sum(meter.quantity) filter (where meter.meter_key in ('cached_write_tokens', 'cache_write_tokens', 'cached_write_text_tokens')), 0) as cached_tokens
    from public.v2_request_usage meter
    where meter.request_event_id = fact.request_event_id
  ) usage on true
  where coalesce(fact.endpoint, '') not in ('video.generation', 'batch', 'music.generate')
    and (p_label is null or fact.safe_metadata @> p_label)
  union all
  select
    rollup.bucket_start,
    rollup.model_id,
    rollup.provider_model_id,
    rollup.key_id,
    rollup.app_id,
    rollup.byok,
    rollup.requests,
    rollup.successful_requests,
    rollup.guardrail_blocked,
    rollup.cost_nanos,
    rollup.tokens,
    rollup.input_tokens,
    rollup.output_tokens,
    rollup.reasoning_tokens,
    rollup.cached_tokens
  from bounds
  join public.v2_private_usage_15m rollup
    on rollup.workspace_id = p_workspace_id
    and rollup.bucket_start >= bounds.rolled_from
    and rollup.bucket_start < bounds.rolled_to
  where bounds.use_rollup
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

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_overview"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, text, uuid, boolean, uuid, jsonb) FROM PUBLIC, "anon", "authenticated";
