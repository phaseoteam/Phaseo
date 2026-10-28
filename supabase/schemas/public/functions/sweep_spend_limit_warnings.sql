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
-- request limits), which is rebuilt hourly and so lags; the push says "about". The rollup leaves
-- out async jobs and realtime sessions, which the gateway's limits count, so their successful
-- requests are added from gateway_requests through a small partial index. Nothing is sent
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
  async_requests as (
    -- Async jobs and realtime sessions, which the rollup leaves out (gateway_requests_async_spend_idx).
    select r.key_id, r.created_at, 1::bigint as requests, coalesce(r.cost_nanos, 0)::numeric as cost_nanos
    from public.gateway_requests r
    where r.success is true
      and r.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
      and r.workspace_id in (select k.workspace_id from limited_keys k)
      and r.created_at >= least(v_week, v_month)
      and r.created_at <= p_now
      and r.key_id in (select k.id from limited_keys k)
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
    from (
      select u.key_id, u.bucket_start, u.successful_requests, u.cost_nanos
      from public.v2_private_usage_15m u
      where u.workspace_id in (select k.workspace_id from limited_keys k)
        and u.bucket_start >= least(v_week, v_month)
        and u.bucket_start <= p_now
        and u.key_id in (select k.id from limited_keys k)
      union all
      select a.key_id, a.created_at, a.requests, a.cost_nanos from async_requests a
    ) u
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
      ) + (
        select coalesce(sum(r.cost_nanos), 0)
        from public.gateway_requests r
        where r.success is true
          and r.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
          and r.workspace_id = b.workspace_id
          and r.created_at >= coalesce((private.spend_limit_period(b.interval, p_now)).period_start, '-infinity'::timestamptz)
          and r.created_at <= p_now
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
