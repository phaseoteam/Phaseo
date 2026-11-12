CREATE OR REPLACE FUNCTION public.get_mobile_week_summary (
  p_user_id      uuid,
  p_workspace_id uuid,
  p_week         text                     DEFAULT NULL::text,
  p_time_zone    text                     DEFAULT NULL::text,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The app's "Your week" screen for one workspace: ISO week p_week ("2026-W43"; this week when
-- null) in p_time_zone (when null, the time zone of the user's most recently seen device, else
-- UTC), up to now while the week is still running. Totals for the week and for the same local
-- span of the week before, the change between them when both are above zero, all seven days, the
-- top five models by requests, and the releases that week the user's notification rules match.
-- Spend is in US dollars. Null when p_week is not a real ISO week.
-- Service role only: the account route checks workspace membership before calling it.
with zone as (
  select coalesce(
    nullif(btrim(p_time_zone), ''),
    (
      select d.time_zone from public.mobile_push_devices d
      where d.user_id = p_user_id and d.status = 'active' and d.time_zone is not null
      order by d.last_seen_at desc, d.id
      limit 1
    ),
    'UTC'
  ) as name
),
bounds as (
  select
    zone.name as time_zone,
    week.monday,
    week.monday::timestamp at time zone zone.name as week_start,
    (week.monday + 7)::timestamp at time zone zone.name as week_end,
    (week.monday - 7)::timestamp at time zone zone.name as previous_start
  from zone
  cross join lateral (
    select case
      when p_week is null then date_trunc('week', p_now at time zone zone.name)::date
      else private.mobile_iso_week_monday(p_week)
    end as monday
  ) week
  where week.monday is not null
),
spans as (
  select
    b.*,
    span.until,
    ((span.until at time zone b.time_zone) - interval '7 days') at time zone b.time_zone as previous_until
  from bounds b
  cross join lateral (select least(b.week_end, greatest(b.week_start, p_now)) as until) span
),
figures as (
  select
    s.*,
    private.mobile_week_usage(p_workspace_id, s.week_start, s.until, s.time_zone, true) as current_week,
    private.mobile_week_usage(p_workspace_id, s.previous_start, s.previous_until, s.time_zone) as previous_week,
    private.mobile_week_releases(p_user_id, s.week_start, s.until) as releases
  from spans s
)
select jsonb_build_object(
  'week', to_char(f.monday, 'IYYY-"W"IW'),
  'timeZone', f.time_zone,
  'from', to_char(f.week_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'to', to_char(f.until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'weekEnd', to_char(f.week_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'complete', p_now >= f.week_end,
  'workspace', (select jsonb_build_object('id', w.id, 'name', w.name) from public.workspaces w where w.id = p_workspace_id),
  'totals', jsonb_build_object(
    'spend', trim_scale(round(cur.spend_nanos / 1e9, 9)),
    'requests', cur.requests,
    'successfulRequests', cur.successful_requests,
    'successRate', case when cur.requests > 0 then round(cur.successful_requests / cur.requests, 4) end,
    'inputTokens', cur.input_tokens,
    'outputTokens', cur.output_tokens,
    'tokens', cur.tokens
  ),
  'previous', jsonb_build_object(
    'from', to_char(f.previous_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'to', to_char(f.previous_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'spend', trim_scale(round(prev.spend_nanos / 1e9, 9)),
    'requests', prev.requests,
    'successfulRequests', prev.successful_requests,
    'successRate', case when prev.requests > 0 then round(prev.successful_requests / prev.requests, 4) end,
    'inputTokens', prev.input_tokens,
    'outputTokens', prev.output_tokens,
    'tokens', prev.tokens
  ),
  'change', jsonb_build_object(
    'spend', case when cur.spend_nanos > 0 and prev.spend_nanos > 0 then round((cur.spend_nanos - prev.spend_nanos) / prev.spend_nanos, 4) end,
    'requests', case when cur.requests > 0 and prev.requests > 0 then round((cur.requests - prev.requests) / prev.requests, 4) end
  ),
  'days', (
    select jsonb_agg(jsonb_build_object(
      'date', day.date,
      'spend', trim_scale(round(coalesce((figure.value ->> 'spendNanos')::numeric, 0) / 1e9, 9)),
      'requests', coalesce((figure.value ->> 'requests')::numeric, 0),
      'inputTokens', coalesce((figure.value ->> 'inputTokens')::numeric, 0),
      'outputTokens', coalesce((figure.value ->> 'outputTokens')::numeric, 0),
      'tokens', coalesce((figure.value ->> 'tokens')::numeric, 0)
    ) order by day.date)
    from generate_series(0, 6) as offsets(n)
    cross join lateral (select f.monday + offsets.n as date) day
    left join lateral (
      select item.value from jsonb_array_elements(f.current_week -> 'days') item
      where item.value ->> 'date' = to_char(day.date, 'YYYY-MM-DD')
    ) figure on true
  ),
  'topModels', coalesce((
    select jsonb_agg(jsonb_build_object(
      'modelId', model.value ->> 'modelId',
      'name', coalesce(catalogue.name, model.value ->> 'modelId'),
      'spend', trim_scale(round((model.value ->> 'spendNanos')::numeric / 1e9, 9)),
      'requests', (model.value ->> 'requests')::numeric
    ) order by model.position)
    from jsonb_array_elements(f.current_week -> 'models') with ordinality as model(value, position)
    left join public.v2_models catalogue on catalogue.model_slug = model.value ->> 'modelId'
    where model.position <= 5
  ), '[]'::jsonb),
  'releases', jsonb_build_object('matching', 'rules', 'count', jsonb_array_length(f.releases), 'items', f.releases)
)
from figures f
cross join lateral (
  select
    (f.current_week ->> 'spendNanos')::numeric as spend_nanos,
    (f.current_week ->> 'requests')::numeric as requests,
    (f.current_week ->> 'successfulRequests')::numeric as successful_requests,
    (f.current_week ->> 'inputTokens')::numeric as input_tokens,
    (f.current_week ->> 'outputTokens')::numeric as output_tokens,
    (f.current_week ->> 'tokens')::numeric as tokens
) cur
cross join lateral (
  select
    (f.previous_week ->> 'spendNanos')::numeric as spend_nanos,
    (f.previous_week ->> 'requests')::numeric as requests,
    (f.previous_week ->> 'successfulRequests')::numeric as successful_requests,
    (f.previous_week ->> 'inputTokens')::numeric as input_tokens,
    (f.previous_week ->> 'outputTokens')::numeric as output_tokens,
    (f.previous_week ->> 'tokens')::numeric as tokens
) prev;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_mobile_week_summary"(uuid, uuid, text, text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_mobile_week_summary"(uuid, uuid, text, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_mobile_week_summary"(uuid, uuid, text, text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_mobile_week_summary"(uuid, uuid, text, text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
