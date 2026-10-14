-- Daily workspace usage totals for the usage overview's month figures, summed in the
-- database instead of reading every rollup row through PostgREST.
SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_private_usage_month_days (
  p_workspace_id uuid,
  p_from         date
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
-- One row per UTC day of exact workspace usage, for the usage overview's month figures.
-- Tokens count like the overview counts a request: the reported total, or input plus
-- output. A rollup can hold both kinds of request, so take the larger sum.
select coalesce(jsonb_agg(jsonb_build_object(
  'date', day.usage_date,
  'costNanos', day.cost_nanos,
  'requests', day.requests,
  'successfulRequests', day.successful_requests,
  'tokens', day.tokens,
  'cachedTokens', day.cached_tokens
) order by day.usage_date), '[]'::jsonb)
from (
  select
    usage.usage_date,
    round(sum(usage.cost_nanos)) as cost_nanos,
    sum(usage.requests) as requests,
    sum(usage.successful_requests) as successful_requests,
    round(sum(coalesce(meters.tokens, 0))) as tokens,
    round(sum(usage.cached_input_tokens)) as cached_tokens
  from public.v2_private_usage_daily usage
  left join lateral (
    select greatest(
      coalesce(sum(meter.quantity) filter (where meter.meter_key = 'total_tokens'), 0),
      coalesce(sum(meter.quantity) filter (where meter.meter_key in ('input_tokens', 'output_tokens')), 0)
    ) as tokens
    from public.v2_private_usage_daily_meters meter
    where meter.rollup_id = usage.rollup_id
      and meter.meter_key in ('total_tokens', 'input_tokens', 'output_tokens')
  ) meters on true
  where usage.workspace_id = p_workspace_id
    and usage.usage_date >= p_from
  group by usage.usage_date
) day;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_month_days"(uuid, date) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_month_days"(uuid, date) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_private_usage_month_days"(uuid, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_private_usage_month_days"(uuid, date) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_private_usage_month_days"(uuid, date) FROM PUBLIC, "anon";
