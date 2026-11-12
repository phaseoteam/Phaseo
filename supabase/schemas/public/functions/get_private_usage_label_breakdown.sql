CREATE OR REPLACE FUNCTION public.get_private_usage_label_breakdown (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_label_key    text,
  p_key_id       uuid                     DEFAULT NULL::uuid,
  p_exclude_key  boolean                  DEFAULT false,
  p_creator_id   uuid                     DEFAULT NULL::uuid,
  p_limit        integer                  DEFAULT 100
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- Usage per value of one request label key from p_from to p_to inclusive, for the usage
-- overview's "group by label": requests, successful requests, spend and tokens for each
-- value, the most expensive first, at most p_limit. A request with several values under
-- the key counts once under each, as in the rollup. Whole quarter hours come from
-- v2_private_usage_labels_15m and the minutes outside them, the latest half hour and
-- hours the outbox processor has yet to rebuild from v2_usage_overview_requests, as in
-- get_private_usage_label_facets.
-- Service role only: the account routes check workspace membership before calling it.
with stale_hours as (
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
    rolled.rolled_to > rolled.rolled_from as use_rollup
  from (
    select
      date_bin('15 minutes', p_from - interval '1 microsecond', timestamptz '2000-01-01 00:00:00+00') + interval '15 minutes' as rolled_from,
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
value_rows as (
  select
    label.label_value,
    request.key_id,
    1::bigint as requests,
    request.successful::integer::bigint as successful_requests,
    request.cost_nanos::numeric as cost_nanos,
    request.tokens,
    request.input_tokens,
    request.output_tokens
  from raw_ranges
  join private.v2_usage_overview_requests request
    on request.workspace_id = p_workspace_id
    and request.occurred_at >= raw_ranges.range_from
    and request.occurred_at < raw_ranges.range_to
  cross join lateral (
    -- A request counts once per value, as in the rollup.
    select distinct element.value ->> 'value' as label_value
    from jsonb_array_elements(request.labels) element
    where element.value ->> 'key' = p_label_key
      and jsonb_typeof(element.value -> 'key') = 'string' and jsonb_typeof(element.value -> 'value') = 'string'
  ) label
  where request.labels @> jsonb_build_array(jsonb_build_object('key', p_label_key))
  union all
  select
    rollup.label_value, rollup.key_id, rollup.requests, rollup.successful_requests, rollup.cost_nanos,
    rollup.tokens, rollup.input_tokens, rollup.output_tokens
  from bounds
  join public.v2_private_usage_labels_15m rollup
    on rollup.workspace_id = p_workspace_id
    and rollup.label_key = p_label_key
    and rollup.bucket_start >= bounds.rolled_from
    and rollup.bucket_start < bounds.rolled_to
  where bounds.use_rollup
    and not exists (select 1 from stale_hours stale where stale.hour_start = date_trunc('hour', rollup.bucket_start, 'UTC'))
),
breakdown as (
  select
    value_rows.label_value,
    sum(value_rows.requests) as requests,
    sum(value_rows.successful_requests) as successful_requests,
    round(sum(value_rows.cost_nanos)) as cost_nanos,
    round(sum(value_rows.tokens)) as tokens,
    round(sum(value_rows.input_tokens)) as input_tokens,
    round(sum(value_rows.output_tokens)) as output_tokens
  from value_rows
  where (p_key_id is null or case when p_exclude_key
      then value_rows.key_id is distinct from p_key_id
      else value_rows.key_id = p_key_id end)
    and (p_creator_id is null or exists (
      select 1 from public.keys key
      where key.id = value_rows.key_id
        and key.workspace_id = p_workspace_id
        and key.created_by = p_creator_id
    ))
  group by 1
  order by 4 desc, 2 desc, 1
  limit greatest(0, least(coalesce(p_limit, 100), 500))
)
select coalesce(jsonb_agg(jsonb_build_object(
  'value', breakdown.label_value,
  'requests', breakdown.requests,
  'successfulRequests', breakdown.successful_requests,
  'costNanos', breakdown.cost_nanos,
  'tokens', breakdown.tokens,
  'inputTokens', breakdown.input_tokens,
  'outputTokens', breakdown.output_tokens
) order by breakdown.cost_nanos desc, breakdown.requests desc, breakdown.label_value), '[]'::jsonb)
from breakdown;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_label_breakdown"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, uuid, boolean, uuid, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_label_breakdown"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, uuid, boolean, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_label_breakdown"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, uuid, boolean, uuid, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_label_breakdown"(uuid, timestamp WITH time zone, timestamp WITH time zone, text, uuid, boolean, uuid, integer) FROM PUBLIC, "anon", "authenticated";
