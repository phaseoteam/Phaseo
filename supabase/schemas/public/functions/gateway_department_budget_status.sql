CREATE OR REPLACE FUNCTION public.gateway_department_budget_status (
  p_workspace_id           uuid,
  p_key_id                 uuid,
  p_requested_amount_nanos bigint DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Admission check for the department budgets that p_key_id counts toward, the sibling of
-- gateway_workspace_budget_status. A budget blocks once its usage reaches the limit, or, with
-- p_requested_amount_nanos > 0, when usage plus the request would exceed it. Usage comes from
-- private.department_budget_usage, the same calculation gateway_spend_limit_seed gives the
-- SpendLimit Durable Object: positive-cost requests of the department's keys this UTC period plus
-- their outstanding holds. Used for batch, video and realtime holds and the request-context
-- fallback; department_budgets lists the budgets that apply even when none is reached.
declare
  v_now timestamptz := now();
  v_result jsonb;
  v_exceeded jsonb;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required';
  end if;
  if coalesce(p_requested_amount_nanos, 0) < 0 then
    raise exception 'requested_amount_must_be_non_negative';
  end if;
  if p_key_id is null or not exists (
    select 1 from public.workspace_department_budgets b where b.workspace_id = p_workspace_id
  ) then
    return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'department_budgets', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', usage.id,
    'department_id', usage.department_id,
    'department_name', usage.department_name,
    'interval', usage.budget_interval,
    'limit_nanos', usage.limit_nanos,
    'usage_nanos', usage.usage_nanos,
    'remaining_nanos', greatest(usage.limit_nanos - usage.usage_nanos, 0),
    'exceeded', case
      when coalesce(p_requested_amount_nanos, 0) > 0 then usage.usage_nanos + p_requested_amount_nanos > usage.limit_nanos
      else usage.usage_nanos >= usage.limit_nanos
    end,
    'window_start', usage.period_start,
    'reset_at', usage.reset_at
  ) order by case usage.budget_interval when 'daily' then 1 when 'weekly' then 2 else 3 end,
    usage.department_name, usage.department_id), '[]'::jsonb)
  into v_result
  from private.department_budget_usage(p_workspace_id, p_key_id, '{}'::text[]) usage;

  select budget into v_exceeded
  from jsonb_array_elements(v_result) with ordinality as item(budget, position)
  where (budget->>'exceeded')::boolean
  order by position
  limit 1;

  if v_exceeded is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'department_' || (v_exceeded->>'interval') || '_cost_budget_reached',
      'limit_window', v_exceeded->>'interval',
      'limit_metric', 'cost',
      'current_value', (v_exceeded->>'usage_nanos')::bigint,
      'limit_value', (v_exceeded->>'limit_nanos')::bigint,
      'reset_at', v_exceeded->'reset_at',
      'department_id', v_exceeded->'department_id',
      'department_name', v_exceeded->'department_name',
      'now', to_jsonb(v_now),
      'department_budgets', v_result
    );
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'department_budgets', v_result);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) TO "service_role";

COMMENT ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) IS 'Admission check for the department budgets an API key counts toward (private.department_budget_usage: positive-cost requests plus outstanding holds this UTC period), with department_<window>_cost_budget_reached reasons and the applying budgets in department_budgets.';

REVOKE ALL ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) FROM PUBLIC, "anon", "authenticated";
