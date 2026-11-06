CREATE OR REPLACE FUNCTION private.department_budget_usage (
  p_workspace_id        uuid,
  p_key_id              uuid   DEFAULT NULL::uuid,
  p_exclude_request_ids text[] DEFAULT '{}'::text[]
)
  RETURNS TABLE (
    id              uuid,
    department_id   uuid,
    department_name text,
    budget_interval text,
    limit_nanos     bigint,
    period_start    timestamp with time zone,
    reset_at        timestamp with time zone,
    usage_nanos     bigint,
    key_ids         uuid[]
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Each department budget of the workspace (only the departments p_key_id counts toward, when
  -- given) with its usage this UTC period: the private.budget_spend_items of the department's keys
  -- (private.department_budget_key_departments), less excluded request ids. The one department
  -- usage calculation behind gateway_department_budget_status (admission) and
  -- gateway_spend_limit_seed (the SpendLimit Durable Object).
  with department_keys as materialized (
    select kd.key_id, kd.department_id
    from private.department_budget_key_departments(p_workspace_id) kd
  ), budgets as materialized (
    select b.id, b.department_id, d.name, b.interval, b.limit_nanos, p.period_start, p.reset_at
    from public.workspace_department_budgets b
    join public.workspace_departments d on d.id = b.department_id
    cross join lateral private.spend_limit_period(b.interval, now()) p
    where b.workspace_id = p_workspace_id
      and (p_key_id is null or b.department_id in (
        select dk.department_id from department_keys dk where dk.key_id = p_key_id))
  ), items as materialized (
    select item.key_id, item.at, item.active, item.nanos
    from private.budget_spend_items(
      p_workspace_id,
      (select min(budgets.period_start) from budgets),
      array(select distinct dk.key_id from department_keys dk where dk.department_id in (select budgets.department_id from budgets)),
      p_exclude_request_ids,
      p_exclude_request_ids
    ) item
  )
  select budgets.id, budgets.department_id, budgets.name, budgets.interval, budgets.limit_nanos,
    budgets.period_start, budgets.reset_at,
    coalesce((
      select sum(items.nanos) from items
      where items.key_id in (select dk.key_id from department_keys dk where dk.department_id = budgets.department_id)
        and (items.active or items.at >= budgets.period_start)
    ), 0)::bigint,
    array(select dk.key_id from department_keys dk where dk.department_id = budgets.department_id order by dk.key_id)
  from budgets;
$function$;

COMMENT ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) IS 'Department budgets of a workspace with their usage this UTC period (private.budget_spend_items of the department''s keys) and keys; shared by gateway_department_budget_status and gateway_spend_limit_seed.';

REVOKE ALL ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."department_budget_usage"(uuid, uuid, text[]) TO "postgres";
