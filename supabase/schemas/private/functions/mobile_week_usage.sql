CREATE OR REPLACE FUNCTION private.mobile_week_usage (
  p_workspace_id uuid,
  p_from         timestamp with time zone,
  p_to           timestamp with time zone,
  p_time_zone    text,
  p_days         boolean DEFAULT false
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- One workspace's usage from p_from up to, but not including, p_to, summed from the exact usage
-- overview (public.get_private_usage_overview, which fills hours the rollup has yet to rebuild
-- from the requests): totals, every model with its requests and spend, most requests first,
-- and with p_days the same totals per local day in p_time_zone. Spend is in nanodollars.
with cells as materialized (
  select
    (overview.cell ->> 'bucket')::timestamp with time zone as bucket,
    nullif(overview.cell ->> 'modelId', '') as model_id,
    coalesce((overview.cell ->> 'requests')::numeric, 0) as requests,
    coalesce((overview.cell ->> 'successfulRequests')::numeric, 0) as successful_requests,
    coalesce((overview.cell ->> 'costNanos')::numeric, 0) as cost_nanos,
    coalesce((overview.cell ->> 'tokens')::numeric, 0) as tokens,
    coalesce((overview.cell ->> 'inputTokens')::numeric, 0) as input_tokens,
    coalesce((overview.cell ->> 'outputTokens')::numeric, 0) as output_tokens
  from jsonb_array_elements(case
    when p_to > p_from then public.get_private_usage_overview(p_workspace_id, p_from, p_to - interval '1 microsecond',
      case when p_days then 'day' end, p_time_zone)
    else '[]'::jsonb
  end) as overview(cell)
)
select jsonb_build_object(
  'requests', coalesce(sum(c.requests), 0),
  'successfulRequests', coalesce(sum(c.successful_requests), 0),
  'spendNanos', coalesce(sum(c.cost_nanos), 0),
  'tokens', coalesce(sum(c.tokens), 0),
  'inputTokens', coalesce(sum(c.input_tokens), 0),
  'outputTokens', coalesce(sum(c.output_tokens), 0),
  'models', coalesce((
    select jsonb_agg(jsonb_build_object('modelId', m.model_id, 'requests', m.requests, 'spendNanos', m.cost_nanos)
      order by m.requests desc, m.cost_nanos desc, m.model_id)
    from (
      select model.model_id, sum(model.requests) as requests, sum(model.cost_nanos) as cost_nanos
      from cells model
      where model.model_id is not null
      group by model.model_id
    ) m
  ), '[]'::jsonb),
  'days', coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', d.day, 'requests', d.requests, 'successfulRequests', d.successful_requests, 'spendNanos', d.cost_nanos,
      'tokens', d.tokens, 'inputTokens', d.input_tokens, 'outputTokens', d.output_tokens
    ) order by d.day)
    from (
      select
        (day.bucket at time zone p_time_zone)::date as day,
        sum(day.requests) as requests,
        sum(day.successful_requests) as successful_requests,
        sum(day.cost_nanos) as cost_nanos,
        sum(day.tokens) as tokens,
        sum(day.input_tokens) as input_tokens,
        sum(day.output_tokens) as output_tokens
      from cells day
      where day.bucket is not null
      group by 1
    ) d
  ), '[]'::jsonb)
)
from cells c;
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_week_usage"(uuid, timestamp with time zone, timestamp with time zone, text, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_week_usage"(uuid, timestamp with time zone, timestamp with time zone, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_week_usage"(uuid, timestamp with time zone, timestamp with time zone, text, boolean) TO "postgres";
