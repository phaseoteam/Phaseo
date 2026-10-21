SET local check_function_bodies = off;

-- Department spend budgets: a table, each budget's spend so far, and a sweep that sends money
-- pushes at about 80% and 100%. They alert only; nothing blocks requests.

CREATE TABLE "public"."workspace_department_budgets" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"  uuid                     NOT NULL,
  "department_id" uuid                     NOT NULL,
  "interval"      text                     NOT NULL,
  "limit_nanos"   bigint                   NOT NULL,
  "created_by"    uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_department_budgets_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_department_budgets_department_id_interval_key" UNIQUE (department_id, "interval"),
  CONSTRAINT "workspace_department_budgets_department_id_workspace_id_fkey" FOREIGN KEY (department_id, workspace_id) REFERENCES public.workspace_departments(id, workspace_id)
    ON DELETE CASCADE,
  CONSTRAINT "workspace_department_budgets_interval_check" CHECK (("interval" = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "workspace_department_budgets_limit_nanos_check" CHECK ((limit_nanos > 0)),
  CONSTRAINT "workspace_department_budgets_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_department_budgets_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_department_budgets"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_department_budgets_created_by_idx ON public.workspace_department_budgets USING btree (created_by);

CREATE INDEX workspace_department_budgets_workspace_id_idx ON public.workspace_department_budgets USING btree (workspace_id, department_id);

CREATE TRIGGER workspace_department_budgets_lock_change
  BEFORE INSERT OR DELETE OR UPDATE ON public.workspace_department_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.lock_workspace_budget_change();

CREATE POLICY "workspace_department_budgets_select_member" ON "public"."workspace_department_budgets"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_department_budgets" TO "service_role";

COMMENT ON TABLE "public"."workspace_department_budgets" IS 'Department spend budgets. A department''s spend is what its linked API keys cost, plus the keys and OAuth requests of its members when the key is not linked to a department. Budgets send alerts at about 80% and 100% (sweep_department_budget_alerts) and do not block requests.';

REVOKE ALL ON TABLE "public"."workspace_department_budgets" FROM "authenticated";

GRANT SELECT ON TABLE "public"."workspace_department_budgets" TO "authenticated";

REVOKE ALL ON TABLE "public"."workspace_department_budgets" FROM "anon";

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
-- keys linked to it (keys.department_id), plus, for keys not linked to any department, the keys
-- its members created and their OAuth requests (OAuth requests use the user's delegated key).
-- A member's departments are their department grants, or their directory override when one is
-- enabled, as the gateway's rate limits count them; a member in several departments counts
-- toward each. Spend comes from v2_private_usage_15m, which is rebuilt hourly and so lags, plus
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
  ),
  key_departments as (
    select k.id as key_id, k.department_id
    from public.keys k
    where k.workspace_id = p_workspace_id
      and k.department_id in (select b.department_id from budgets b)
    union
    select k.id, m.department_id
    from public.keys k
    join member_departments m on m.user_id = coalesce(k.oauth_user_id, k.created_by)
    where k.workspace_id = p_workspace_id
      and k.department_id is null
      and m.department_id in (select b.department_id from budgets b)
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
