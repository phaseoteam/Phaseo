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
