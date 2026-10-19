-- Mobile push phase 2: budget alerts.
--   * record_spend_limit_reached turns the gateway's rejection for a used-up workspace budget or
--     API key limit into one money push per budget or key limit, period and limit value. The
--     gateway calls it in the background after responding.
--   * sweep_spend_limit_warnings, run every 15 minutes, warns once per period when a budget or
--     key limit is about 80% used by v2_private_usage_15m, with a forecast for weekly and monthly
--     periods, and never after the limit was reached.
--   * Both write workspace_notification_events, which fan out to owners and admins, and to the
--     key's creator for key limits. Nothing is emailed.
SET local check_function_bodies = off;


CREATE OR REPLACE FUNCTION private.spend_limit_period (
  p_window       text,
  p_now          timestamp with time zone,
  OUT period_start timestamp with time zone,
  OUT reset_at     timestamp with time zone
)
  RETURNS record
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- The UTC period a budget or API key limit counts over at p_now, as the gateway counts it: a
  -- day, a week from Monday, a calendar month, or all time (lifetime, with no start or reset).
  select start_utc at time zone 'UTC',
    (start_utc + case p_window when 'daily' then interval '1 day' when 'weekly' then interval '1 week' else interval '1 month' end) at time zone 'UTC'
  from (
    select case p_window
      when 'daily' then date_trunc('day', p_now at time zone 'UTC')
      when 'weekly' then date_trunc('week', p_now at time zone 'UTC')
      when 'monthly' then date_trunc('month', p_now at time zone 'UTC')
    end as start_utc
  ) period;
$function$;

REVOKE ALL ON FUNCTION "private"."spend_limit_period"(text, timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_limit_period"(text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_limit_period"(text, timestamp with time zone) TO "postgres";

CREATE OR REPLACE FUNCTION private.spend_limit_amount (
  p_metric text,
  p_value  numeric
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- An amount counted against a budget or key limit: dollars for cost ($80.00, from nanos),
  -- otherwise a request count (1,000 requests).
  select case
    when p_metric = 'cost' then private.workspace_push_usd(p_value)
    else to_char(p_value, 'FM999,999,999,990') || case when p_value = 1 then ' request' else ' requests' end
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."spend_limit_amount"(text, numeric) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_limit_amount"(text, numeric) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_limit_amount"(text, numeric) TO "postgres";

CREATE OR REPLACE FUNCTION public.record_spend_limit_reached (
  p_workspace_id uuid,
  p_key_id       uuid,
  p_reason       text,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records that the gateway rejected a request because a workspace budget or an API key limit is
-- used up (p_reason is the rejection reason), as one money push per budget or key limit, period
-- and limit value: owners and admins hear that requests are blocked, and for a key limit so does
-- the key's creator. The gateway calls this in the background after responding, at most once
-- per isolate and period, so a blocked workspace that keeps retrying costs one call per isolate.
-- Returns true only the first time; other rejection reasons are ignored.
declare
  v_match text[];
  v_kind text;
  v_window text;
  v_metric text;
  v_limit numeric;
  v_subject text;
  v_name text;
  v_creator uuid;
  v_key_id uuid;
  v_period record;
  v_until text;
  v_title text;
  v_body text;
  v_href text;
  v_inserted uuid;
begin
  if p_workspace_id is null or p_reason is null or p_now is null then
    return false;
  end if;

  v_match := regexp_match(p_reason, '^workspace_(daily|weekly|monthly|lifetime)_cost_budget_reached$');
  if v_match is not null then
    v_kind := 'budget_reached';
    v_window := v_match[1];
    v_metric := 'cost';
    select 'budget:' || b.id, b.limit_nanos into v_subject, v_limit
    from public.workspace_budgets b
    where b.workspace_id = p_workspace_id and b.interval = v_window;
  else
    v_match := regexp_match(p_reason, '^(daily|weekly|monthly)_(request|cost)_limit_reached$');
    if v_match is null or p_key_id is null then
      return false;
    end if;
    v_kind := 'key_limit_reached';
    v_window := v_match[1];
    v_metric := case when v_match[2] = 'request' then 'requests' else 'cost' end;
    select 'key:' || k.id || ':' || v_metric, k.id, k.name, k.created_by,
      case v_window || ':' || v_metric
        when 'daily:requests' then k.daily_limit_requests
        when 'weekly:requests' then k.weekly_limit_requests
        when 'monthly:requests' then k.monthly_limit_requests
        when 'daily:cost' then k.daily_limit_cost_nanos
        when 'weekly:cost' then k.weekly_limit_cost_nanos
        when 'monthly:cost' then k.monthly_limit_cost_nanos
      end
      into v_subject, v_key_id, v_name, v_creator, v_limit
    from public.keys k
    where k.id = p_key_id and k.workspace_id = p_workspace_id;
  end if;
  if v_subject is null or coalesce(v_limit, 0) <= 0 then
    return false;
  end if;

  select * into v_period from private.spend_limit_period(v_window, p_now);
  v_until := case
    when v_window = 'daily' then 'midnight UTC'
    when v_period.reset_at is not null then to_char(v_period.reset_at at time zone 'UTC', 'Mon FMDD')
  end;

  if v_kind = 'budget_reached' then
    v_title := 'Requests blocked by the ' || v_window || ' budget';
    v_body := 'The ' || private.workspace_push_usd(v_limit) || ' ' || v_window || ' budget is used up. '
      || coalesce('Requests resume ' || case when v_window = 'daily' then 'at ' else '' end || v_until || ', or raise the budget.', 'Raise it to resume requests.');
    v_href := '/settings/usage/overview';
  else
    v_title := 'API key ''' || case when char_length(v_name) > 40 then left(v_name, 39) || '…' else v_name end || ''' hit its ' || v_window || ' limit';
    v_body := 'Requests with it are blocked until ' || v_until || '. The limit is ' || private.spend_limit_amount(v_metric, v_limit)
      || ' a ' || case v_window when 'daily' then 'day' when 'weekly' then 'week' else 'month' end || '.';
    v_href := '/settings/keys';
  end if;

  insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, key_id, key_created_by, payload, occurred_at)
  values (
    p_workspace_id,
    v_kind,
    'money',
    v_kind || ':' || v_subject || ':' || v_window || ':' || coalesce(to_char(v_period.period_start at time zone 'UTC', 'YYYY-MM-DD'), 'lifetime') || ':' || v_limit,
    v_key_id,
    v_creator,
    jsonb_build_object(
      'push', jsonb_build_object('title', v_title, 'body', v_body, 'href', v_href, 'lowerLead', v_kind = 'budget_reached'),
      'window', v_window, 'metric', v_metric, 'limit', v_limit, 'reason', p_reason,
      'periodStart', v_period.period_start, 'resetAt', v_period.reset_at
    ),
    p_now
  )
  on conflict (dedupe_key) do nothing
  returning id into v_inserted;

  return v_inserted is not null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_spend_limit_reached"(uuid, uuid, text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_spend_limit_reached"(uuid, uuid, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_spend_limit_reached"(uuid, uuid, text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_spend_limit_reached"(uuid, uuid, text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.sweep_spend_limit_warnings (
  p_now timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Warns once when a workspace budget or an active API key's limit is about 80% used in its
-- current period, as a money push: owners and admins hear about it, and for a key limit so does
-- the key's creator. Usage comes from v2_private_usage_15m (cost, and successful requests for
-- request limits), which is rebuilt hourly and so lags; the push says "about". Nothing is sent
-- for a limit already reached this period (record_spend_limit_reached), or one the rollup puts
-- at 100% or more: the gateway blocks the next request and that alert follows. Weekly and
-- monthly warnings say when the limit runs out at the period's pace so far, if that is before
-- the period ends. One event per budget or key limit, period and limit value, so a limit raised
-- mid-period can warn again. Only workspaces with a budget or a limited key are read.
declare
  v_day timestamptz := (private.spend_limit_period('daily', p_now)).period_start;
  v_week timestamptz := (private.spend_limit_period('weekly', p_now)).period_start;
  v_month timestamptz := (private.spend_limit_period('monthly', p_now)).period_start;
  v_budgets integer;
  v_keys integer;
  v_warned integer;
begin
  if p_now is null then
    raise exception 'invalid_spend_limit_sweep_time';
  end if;

  select count(*) into v_budgets from public.workspace_budgets;
  select count(*) into v_keys
  from public.keys k
  where k.status = 'active'
    and greatest(k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
      k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos) > 0;
  if v_budgets = 0 and v_keys = 0 then
    return jsonb_build_object('budgets', 0, 'limitedKeys', 0, 'warned', 0);
  end if;

  with limited_keys as (
    select k.id, k.workspace_id, k.name, k.created_by,
      k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
      k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos
    from public.keys k
    where k.status = 'active'
      and greatest(k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
        k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos) > 0
  ),
  key_usage as (
    -- One pass over each limited key's workspace since the earlier of this week's and this month's start.
    select
      u.key_id,
      coalesce(sum(u.successful_requests) filter (where u.bucket_start >= v_day), 0) as day_requests,
      coalesce(sum(u.successful_requests) filter (where u.bucket_start >= v_week), 0) as week_requests,
      coalesce(sum(u.successful_requests) filter (where u.bucket_start >= v_month), 0) as month_requests,
      coalesce(sum(u.cost_nanos) filter (where u.bucket_start >= v_day), 0) as day_cost,
      coalesce(sum(u.cost_nanos) filter (where u.bucket_start >= v_week), 0) as week_cost,
      coalesce(sum(u.cost_nanos) filter (where u.bucket_start >= v_month), 0) as month_cost
    from public.v2_private_usage_15m u
    where u.workspace_id in (select k.workspace_id from limited_keys k)
      and u.bucket_start >= least(v_week, v_month)
      and u.bucket_start <= p_now
      and u.key_id in (select k.id from limited_keys k)
    group by u.key_id
  ),
  limits as (
    select
      b.workspace_id, null::uuid as key_id, null::text as key_name, null::uuid as key_created_by,
      'budget_warning' as kind, 'budget:' || b.id as subject, b.interval as time_window, 'cost' as metric,
      b.limit_nanos::numeric as limit_value,
      (
        select coalesce(sum(u.cost_nanos), 0)
        from public.v2_private_usage_15m u
        where u.workspace_id = b.workspace_id
          and u.bucket_start >= coalesce((private.spend_limit_period(b.interval, p_now)).period_start, '-infinity'::timestamptz)
          and u.bucket_start <= p_now
      ) as used
    from public.workspace_budgets b
    union all
    select
      k.workspace_id, k.id, k.name, k.created_by,
      'key_limit_warning', 'key:' || k.id || ':' || l.metric, l.time_window, l.metric,
      l.limit_value::numeric,
      l.used
    from limited_keys k
    left join key_usage ku on ku.key_id = k.id
    cross join lateral (values
      ('daily', 'requests', k.daily_limit_requests, coalesce(ku.day_requests, 0)::numeric),
      ('weekly', 'requests', k.weekly_limit_requests, coalesce(ku.week_requests, 0)::numeric),
      ('monthly', 'requests', k.monthly_limit_requests, coalesce(ku.month_requests, 0)::numeric),
      ('daily', 'cost', k.daily_limit_cost_nanos, coalesce(ku.day_cost, 0)::numeric),
      ('weekly', 'cost', k.weekly_limit_cost_nanos, coalesce(ku.week_cost, 0)::numeric),
      ('monthly', 'cost', k.monthly_limit_cost_nanos, coalesce(ku.month_cost, 0)::numeric)
    ) l(time_window, metric, limit_value, used)
    where l.limit_value > 0
  ),
  due as (
    select
      l.*,
      p.period_start,
      p.reset_at,
      coalesce(to_char(p.period_start at time zone 'UTC', 'YYYY-MM-DD'), 'lifetime') || ':' || l.limit_value as period_key,
      case
        when l.time_window in ('weekly', 'monthly') and l.used > 0
          and p.period_start + (p_now - p.period_start) * (l.limit_value / l.used)::double precision < p.reset_at
          then p.period_start + (p_now - p.period_start) * (l.limit_value / l.used)::double precision
      end as runs_out_at,
      case when l.key_name is null then null
        when char_length(l.key_name) > 40 then '''' || left(l.key_name, 39) || '…'''
        else '''' || l.key_name || ''''
      end as quoted_key,
      case l.time_window when 'daily' then ' so far today.' when 'weekly' then ' so far this week.' when 'monthly' then ' so far this month.' else ' in total.' end as so_far
    from limits l
    cross join lateral private.spend_limit_period(l.time_window, p_now) p
    where l.used >= 0.8 * l.limit_value
      and l.used < l.limit_value
  ),
  inserted as (
    insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, key_id, key_created_by, payload, occurred_at)
    select
      d.workspace_id,
      d.kind,
      'money',
      d.kind || ':' || d.subject || ':' || d.time_window || ':' || d.period_key,
      d.key_id,
      d.key_created_by,
      jsonb_build_object(
        'push', jsonb_build_object(
          'title', case when d.kind = 'budget_warning'
            then 'About 80% of the ' || d.time_window || ' budget used'
            else 'API key ' || d.quoted_key || ' is at about 80% of its ' || d.time_window || ' limit' end,
          'body', case when d.metric = 'cost'
              then private.spend_limit_amount('cost', d.used) || ' of ' || private.spend_limit_amount('cost', d.limit_value)
              else to_char(d.used, 'FM999,999,999,990') || ' of ' || private.spend_limit_amount('requests', d.limit_value) end
            || d.so_far
            || coalesce(' At this pace it runs out around ' || to_char(d.runs_out_at at time zone 'UTC', 'Mon FMDD') || '.', ''),
          'href', case when d.kind = 'budget_warning' then '/settings/usage/overview' else '/settings/keys' end,
          'lowerLead', d.kind = 'budget_warning'
        ),
        'window', d.time_window, 'metric', d.metric, 'limit', d.limit_value, 'used', d.used,
        'periodStart', d.period_start, 'resetAt', d.reset_at, 'runsOutAt', d.runs_out_at
      ),
      p_now
    from due d
    where not exists (
      select 1 from public.workspace_notification_events e
      where e.dedupe_key = replace(d.kind, '_warning', '_reached') || ':' || d.subject || ':' || d.time_window || ':' || d.period_key
    )
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*)::integer into v_warned from inserted;

  return jsonb_build_object('budgets', v_budgets, 'limitedKeys', v_keys, 'warned', v_warned);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_limit_warnings"(timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_spend_limit_warnings"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_spend_limit_warnings"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_spend_limit_warnings"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
