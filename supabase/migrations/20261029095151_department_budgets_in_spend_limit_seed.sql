SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.department_budget_key_departments (
  p_workspace_id uuid
)
  RETURNS TABLE (
    key_id        uuid,
    department_id uuid
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- The API keys whose cost counts toward each department that has a budget in the workspace,
  -- one row per key and department. A department's keys are the keys linked to it
  -- (keys.department_id), plus, for keys not linked to any department, the keys its members
  -- created and their OAuth keys (OAuth requests use the user's delegated key). A member's
  -- departments are their department grants, or their directory override when one is enabled,
  -- as the gateway's rate limits count them; a member in several departments counts toward each.
  -- Shared by workspace_department_budget_status (alerts) and gateway_spend_limit_seed (blocking).
  with budgeted as (
    select distinct b.department_id
    from public.workspace_department_budgets b
    where b.workspace_id = p_workspace_id
  ),
  overrides as (
    select o.user_id, o.department_id
    from public.workspace_member_overrides o
    where o.workspace_id = p_workspace_id
      and o.department_override_enabled
  ),
  member_departments as (
    select g.user_id, g.department_id
    from public.workspace_department_grants g
    where g.workspace_id = p_workspace_id
      and not exists (select 1 from overrides o where o.user_id = g.user_id)
    union
    select o.user_id, o.department_id from overrides o where o.department_id is not null
  )
  select k.id, k.department_id
  from public.keys k
  where k.workspace_id = p_workspace_id
    and k.department_id in (select budgeted.department_id from budgeted)
  union
  select k.id, m.department_id
  from public.keys k
  join member_departments m on m.user_id = coalesce(k.oauth_user_id, k.created_by)
  where k.workspace_id = p_workspace_id
    and k.department_id is null
    and m.department_id in (select budgeted.department_id from budgeted);
$function$;

COMMENT ON FUNCTION "private"."department_budget_key_departments"(uuid) IS 'API keys counting toward each budgeted department of a workspace: keys linked to the department, plus unlinked keys created by (or OAuth-delegated to) its members. Members'' departments are their grants, or their directory override when enabled.';

REVOKE ALL ON FUNCTION "private"."department_budget_key_departments"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."department_budget_key_departments"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."department_budget_key_departments"(uuid) TO "postgres";

CREATE OR REPLACE FUNCTION public.workspace_department_budget_status (
  p_workspace_id uuid,
  p_now          timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Each department budget in the workspace with its spend so far in the current UTC period, as
-- a JSON array ordered by department and period. A department's spend is the cost of the API
-- keys private.department_budget_key_departments gives it: keys linked to it, plus, for keys not
-- linked to any department, the keys its members created and their OAuth requests. Spend comes from v2_private_usage_15m, which is rebuilt hourly and so lags, plus
-- async jobs and realtime sessions from gateway_requests, which the rollup leaves out.
declare
  v_result jsonb;
begin
  if p_workspace_id is null or p_now is null then
    raise exception 'invalid_department_budget_status_arguments';
  end if;

  with budgets as (
    select b.*, p.period_start, p.reset_at
    from public.workspace_department_budgets b
    cross join lateral private.spend_limit_period(b.interval, p_now) p
    where b.workspace_id = p_workspace_id
  ),
  key_departments as (
    select kd.key_id, kd.department_id
    from private.department_budget_key_departments(p_workspace_id) kd
  ),
  spend as (
    select u.key_id, u.bucket_start as at, u.cost_nanos
    from public.v2_private_usage_15m u
    where u.workspace_id = p_workspace_id
      and u.bucket_start >= (select min(b.period_start) from budgets b)
      and u.bucket_start <= p_now
      and u.key_id in (select kd.key_id from key_departments kd)
    union all
    select r.key_id, r.created_at, coalesce(r.cost_nanos, 0)
    from public.gateway_requests r
    where r.success is true
      and r.endpoint = any (array['video.generation', 'batch', 'music.generate', 'audio.realtime'])
      and r.workspace_id = p_workspace_id
      and r.created_at >= (select min(b.period_start) from budgets b)
      and r.created_at <= p_now
      and r.key_id in (select kd.key_id from key_departments kd)
  ),
  usage as (
    select b.id, coalesce(sum(s.cost_nanos), 0)::numeric as used_nanos
    from budgets b
    left join key_departments kd on kd.department_id = b.department_id
    left join spend s on s.key_id = kd.key_id and s.at >= b.period_start
    group by b.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'workspace_id', b.workspace_id,
    'department_id', b.department_id,
    'department_name', d.name,
    'interval', b.interval,
    'limit_nanos', b.limit_nanos,
    'usage_nanos', u.used_nanos,
    'remaining_nanos', greatest(b.limit_nanos - u.used_nanos, 0),
    'exceeded', u.used_nanos >= b.limit_nanos,
    'window_start', b.period_start,
    'reset_at', b.reset_at,
    'created_by', b.created_by,
    'created_at', b.created_at,
    'updated_at', b.updated_at
  ) order by d.name, b.department_id, case b.interval when 'daily' then 1 when 'weekly' then 2 else 3 end), '[]'::jsonb)
  into v_result
  from budgets b
  join usage u on u.id = b.id
  join public.workspace_departments d on d.id = b.department_id;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."workspace_department_budget_status"(uuid, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_department_budget_status"(uuid, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_department_budget_status"(uuid, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."workspace_department_budget_status"(uuid, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_spend_limit_seed (
  p_workspace_id        uuid,
  p_key_ids             uuid[],
  p_exclude_request_ids text[] DEFAULT '{}'::text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  -- Windows and filters must stay identical to the key-limit accounting in
  -- public.gateway_fetch_request_context_without_workspace_budget.
  now_utc     timestamptz := (now() at time zone 'utc');
  day_start   timestamptz := date_trunc('day',  now_utc);
  week_start  timestamptz := date_trunc('week', now_utc);   -- Monday 00:00 UTC
  month_start timestamptz := date_trunc('month', now_utc);
  v_key_ids   uuid[] := coalesce(p_key_ids, '{}'::uuid[]);
  v_exclude   text[] := coalesce(p_exclude_request_ids, '{}'::text[]);
  v_keys      jsonb;
  v_excluded  jsonb := '[]'::jsonb;
  v_departments jsonb := '[]'::jsonb;
begin
  if p_workspace_id is null then
    raise exception using errcode = '22023', message = 'workspace_id_required';
  end if;
  if cardinality(v_key_ids) > 100 then
    raise exception using errcode = '22023', message = 'too_many_key_ids';
  end if;
  if cardinality(v_exclude) > 5000 then
    raise exception using errcode = '22023', message = 'too_many_excluded_request_ids';
  end if;

  with key_rows as (
    select
      k.id,
      k.status,
      coalesce(k.soft_blocked, false) as soft_blocked,
      k.daily_limit_requests,   k.weekly_limit_requests,   k.monthly_limit_requests,
      k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos,
      -- Unlimited keys need no history read, as in the context function.
      coalesce(greatest(k.daily_limit_requests, k.weekly_limit_requests, k.monthly_limit_requests,
        k.daily_limit_cost_nanos, k.weekly_limit_cost_nanos, k.monthly_limit_cost_nanos) > 0, false) as limited
    from public.keys k
    where k.id = any(v_key_ids)
      and k.workspace_id = p_workspace_id
  ), usage as (
    select
      gr.key_id,
      count(*) filter (where gr.created_at >= day_start)                                  as used_day_reqs,
      count(*) filter (where gr.created_at >= week_start)                                 as used_wk_reqs,
      count(*) filter (where gr.created_at >= month_start)                                as used_mo_reqs,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= day_start), 0)::bigint   as used_day_cost,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= week_start), 0)::bigint  as used_wk_cost,
      coalesce(sum(gr.cost_nanos) filter (where gr.created_at >= month_start), 0)::bigint as used_mo_cost
    from public.gateway_requests gr
    where gr.key_id = any(array(select key_rows.id from key_rows where key_rows.limited))
      and gr.workspace_id = p_workspace_id
      and gr.success is true
      and gr.created_at >= least(week_start, month_start)
      and not (gr.request_id = any(v_exclude))
    group by gr.key_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'key_id', key_rows.id,
    'active', key_rows.status = 'active',
    'soft_blocked', key_rows.soft_blocked,
    'limited', key_rows.limited,
    'limits', jsonb_build_object(
      'daily',   jsonb_build_object('requests', key_rows.daily_limit_requests,   'cost_nanos', key_rows.daily_limit_cost_nanos),
      'weekly',  jsonb_build_object('requests', key_rows.weekly_limit_requests,  'cost_nanos', key_rows.weekly_limit_cost_nanos),
      'monthly', jsonb_build_object('requests', key_rows.monthly_limit_requests, 'cost_nanos', key_rows.monthly_limit_cost_nanos)
    ),
    'used', case when key_rows.limited then jsonb_build_object(
      'daily',   jsonb_build_object('requests', coalesce(usage.used_day_reqs, 0), 'cost_nanos', coalesce(usage.used_day_cost, 0)),
      'weekly',  jsonb_build_object('requests', coalesce(usage.used_wk_reqs, 0),  'cost_nanos', coalesce(usage.used_wk_cost, 0)),
      'monthly', jsonb_build_object('requests', coalesce(usage.used_mo_reqs, 0),  'cost_nanos', coalesce(usage.used_mo_cost, 0))
    ) else null end
  ) order by key_rows.id), '[]'::jsonb)
  into v_keys
  from key_rows
  left join usage on usage.key_id = key_rows.id;

  -- Department budgets with their usage this UTC period, counted like key usage (successful
  -- gateway_requests rows of the department's keys, less excluded request ids), and every key
  -- that counts toward each department (private.department_budget_key_departments).
  if exists (select 1 from public.workspace_department_budgets b where b.workspace_id = p_workspace_id) then
    with department_keys as (
      select kd.key_id, kd.department_id
      from private.department_budget_key_departments(p_workspace_id) kd
    ), budgets as (
      select b.id, b.department_id, d.name as department_name, b.interval, b.limit_nanos, p.period_start, p.reset_at
      from public.workspace_department_budgets b
      join public.workspace_departments d on d.id = b.department_id
      cross join lateral private.spend_limit_period(b.interval, now()) p
      where b.workspace_id = p_workspace_id
    ), spend as (
      select gr.key_id, gr.created_at, coalesce(gr.cost_nanos, 0) as cost_nanos
      from public.gateway_requests gr
      where gr.key_id in (select department_keys.key_id from department_keys)
        and gr.workspace_id = p_workspace_id
        and gr.success is true
        and gr.created_at >= (select min(budgets.period_start) from budgets)
        and not (gr.request_id = any(v_exclude))
    ), usage as (
      select budgets.id, coalesce(sum(spend.cost_nanos), 0)::bigint as usage_nanos
      from budgets
      left join department_keys on department_keys.department_id = budgets.department_id
      left join spend on spend.key_id = department_keys.key_id and spend.created_at >= budgets.period_start
      group by budgets.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', budgets.id,
      'department_id', budgets.department_id,
      'department_name', budgets.department_name,
      'interval', budgets.interval,
      'limit_nanos', budgets.limit_nanos,
      'usage_nanos', usage.usage_nanos,
      'window_start', budgets.period_start,
      'reset_at', budgets.reset_at,
      'key_ids', coalesce((
        select jsonb_agg(department_keys.key_id order by department_keys.key_id)
        from department_keys
        where department_keys.department_id = budgets.department_id
      ), '[]'::jsonb)
    ) order by budgets.department_id, budgets.interval), '[]'::jsonb)
    into v_departments
    from budgets
    join usage on usage.id = budgets.id;
  end if;

  -- Excluded requests that are already persisted, so the caller can stop
  -- tracking them separately and count the stored row instead.
  if cardinality(v_exclude) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'request_id', gr.request_id,
      'key_id', gr.key_id,
      'success', gr.success,
      'cost_nanos', coalesce(gr.cost_nanos, 0),
      'created_at', gr.created_at
    ) order by gr.request_id, gr.created_at), '[]'::jsonb)
    into v_excluded
    from public.gateway_requests gr
    where gr.workspace_id = p_workspace_id
      and gr.request_id = any(v_exclude)
      and gr.created_at >= least(week_start, month_start) - interval '1 day';
  end if;

  return jsonb_build_object(
    'now', to_jsonb(now_utc),
    'day_start', to_jsonb(day_start),
    'week_start', to_jsonb(week_start),
    'month_start', to_jsonb(month_start),
    'keys', v_keys,
    'budget_status', public.gateway_workspace_budget_status(p_workspace_id, 0),
    'excluded_rows', v_excluded,
    'department_budgets', v_departments
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) IS 'Seeds the gateway spend-limit coordinator: per-key day/week/month usage with the request-context windows and filters (excluding already-recorded request ids), plus workspace budget status and department budgets with their usage and keys.';

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_spend_limit_seed"(uuid, uuid[], text[]) FROM PUBLIC, "anon", "authenticated";
