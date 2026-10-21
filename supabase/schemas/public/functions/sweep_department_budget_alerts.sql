CREATE OR REPLACE FUNCTION public.sweep_department_budget_alerts (
  p_now timestamp with time zone DEFAULT now()
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Sends a money push to owners and admins once per department budget, period and limit value
-- when the department reaches about 80% of the budget (department_budget_warning), and again
-- when it reaches 100% (department_budget_reached). Department budgets do not block requests, so
-- unlike workspace budgets the 100% alert comes from this sweep rather than a rejection, and
-- says requests keep running. Spend is workspace_department_budget_status's, which lags by up
-- to an hour, so the pushes say "about". No warning is sent once the budget is reached. A limit
-- changed mid-period can alert again. Only workspaces with a department budget are read.
declare
  v_budgets integer;
  v_alerted integer := 0;
  v_count integer;
  v_workspace uuid;
begin
  if p_now is null then
    raise exception 'invalid_department_budget_sweep_time';
  end if;

  select count(*) into v_budgets from public.workspace_department_budgets;
  if v_budgets = 0 then
    return jsonb_build_object('budgets', 0, 'alerted', 0);
  end if;

  for v_workspace in select distinct b.workspace_id from public.workspace_department_budgets b loop
    with status as (
      select
        (s ->> 'id') as budget_id,
        (s ->> 'department_name') as department_name,
        (s ->> 'interval') as time_window,
        (s ->> 'limit_nanos')::numeric as limit_value,
        (s ->> 'usage_nanos')::numeric as used
      from jsonb_array_elements(public.workspace_department_budget_status(v_workspace, p_now)) s
    ),
    due as (
      select
        st.*,
        p.period_start,
        p.reset_at,
        case when st.used >= st.limit_value then 'department_budget_reached' else 'department_budget_warning' end as kind,
        to_char(p.period_start at time zone 'UTC', 'YYYY-MM-DD') || ':' || st.limit_value as period_key,
        case when char_length(st.department_name) > 40 then left(st.department_name, 39) || '…' else st.department_name end as name,
        case st.time_window when 'daily' then ' so far today.' when 'weekly' then ' so far this week.' else ' so far this month.' end as so_far
      from status st
      cross join lateral private.spend_limit_period(st.time_window, p_now) p
      where st.used >= 0.8 * st.limit_value
    ),
    inserted as (
      insert into public.workspace_notification_events (workspace_id, kind, category, dedupe_key, payload, occurred_at)
      select
        v_workspace,
        d.kind,
        'money',
        d.kind || ':department_budget:' || d.budget_id || ':' || d.time_window || ':' || d.period_key,
        jsonb_build_object(
          'push', jsonb_build_object(
            'title', case when d.kind = 'department_budget_reached'
              then d.name || ' has used its ' || d.time_window || ' budget'
              else d.name || ' is at about 80% of its ' || d.time_window || ' budget' end,
            'body', private.spend_limit_amount('cost', d.used) || ' of ' || private.spend_limit_amount('cost', d.limit_value)
              || d.so_far
              || case when d.kind = 'department_budget_reached' then ' Requests keep running: department budgets send alerts but don''t block.' else '' end,
            'href', '/settings/usage/overview'
          ),
          'departmentBudgetId', d.budget_id, 'window', d.time_window, 'metric', 'cost',
          'limit', d.limit_value, 'used', d.used, 'periodStart', d.period_start, 'resetAt', d.reset_at
        ),
        p_now
      from due d
      where d.kind = 'department_budget_reached'
        or not exists (
          select 1 from public.workspace_notification_events e
          where e.dedupe_key = 'department_budget_reached:department_budget:' || d.budget_id || ':' || d.time_window || ':' || d.period_key
        )
      on conflict (dedupe_key) do nothing
      returning 1
    )
    select count(*)::integer into v_count from inserted;
    v_alerted := v_alerted + v_count;
  end loop;

  return jsonb_build_object('budgets', v_budgets, 'alerted', v_alerted);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sweep_department_budget_alerts"(timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."sweep_department_budget_alerts"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sweep_department_budget_alerts"(timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."sweep_department_budget_alerts"(timestamp with time zone) FROM PUBLIC, "anon", "authenticated";
