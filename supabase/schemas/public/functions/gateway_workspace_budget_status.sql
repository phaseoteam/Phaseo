CREATE OR REPLACE FUNCTION public.gateway_workspace_budget_status (
  p_workspace_id           uuid,
  p_requested_amount_nanos bigint DEFAULT 0
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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

  with configured as (
    select
      budget.id,
      budget.workspace_id,
      budget.interval,
      budget.limit_nanos,
      budget.created_by,
      budget.created_at,
      budget.updated_at,
      case budget.interval
        when 'daily' then date_trunc('day', v_now at time zone 'utc') at time zone 'utc'
        when 'weekly' then date_trunc('week', v_now at time zone 'utc') at time zone 'utc'
        when 'monthly' then date_trunc('month', v_now at time zone 'utc') at time zone 'utc'
        else null
      end as window_start,
      case budget.interval
        when 'daily' then (date_trunc('day', v_now at time zone 'utc') + interval '1 day') at time zone 'utc'
        when 'weekly' then (date_trunc('week', v_now at time zone 'utc') + interval '1 week') at time zone 'utc'
        when 'monthly' then (date_trunc('month', v_now at time zone 'utc') + interval '1 month') at time zone 'utc'
        else null
      end as reset_at
    from public.workspace_budgets budget
    where budget.workspace_id = p_workspace_id
  ), items as materialized (
    -- private.budget_spend_items, as for department budgets: positive-cost requests, active holds
    -- in every period, captured video and free-model holds less their audited cost, and unbilled
    -- spend (charges without a request row, delivered requests pending reconciliation).
    select item.at, item.active, item.nanos
    from private.budget_spend_items(
      p_workspace_id,
      (select case when bool_or(configured.window_start is null) then null else min(configured.window_start) end from configured)
    ) item
    where exists (select 1 from configured)
  ), usage_rows as (
    select
      configured.*,
      coalesce((
        select sum(items.nanos) from items
        where items.active or configured.window_start is null or items.at >= configured.window_start
      ), 0)::bigint as usage_nanos
    from configured
  ), normalized as (
    select *,
      usage_nanos + coalesce(p_requested_amount_nanos, 0) as projected_usage_nanos,
      greatest(limit_nanos - usage_nanos, 0) as remaining_nanos,
      case
        when coalesce(p_requested_amount_nanos, 0) > 0
          then usage_nanos + p_requested_amount_nanos > limit_nanos
        else usage_nanos >= limit_nanos
      end as exceeded
    from usage_rows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'workspace_id', workspace_id,
    'interval', interval,
    'limit_nanos', limit_nanos,
    'usage_nanos', usage_nanos,
    'remaining_nanos', remaining_nanos,
    'projected_usage_nanos', projected_usage_nanos,
    'exceeded', exceeded,
    'window_start', window_start,
    'reset_at', reset_at,
    'created_by', created_by,
    'created_at', created_at,
    'updated_at', updated_at
  ) order by case interval when 'daily' then 1 when 'weekly' then 2 when 'monthly' then 3 else 4 end), '[]'::jsonb)
  into v_result
  from normalized;

  select budget
  into v_exceeded
  from jsonb_array_elements(v_result) budget
  where (budget->>'exceeded')::boolean
  order by case budget->>'interval' when 'daily' then 1 when 'weekly' then 2 when 'monthly' then 3 else 4 end
  limit 1;

  if v_exceeded is not null then
    return jsonb_build_object(
      'ok', false,
      'reason', 'workspace_' || (v_exceeded->>'interval') || '_cost_budget_reached',
      'limit_window', v_exceeded->>'interval',
      'limit_metric', 'cost',
      'current_value', (v_exceeded->>'usage_nanos')::bigint,
      'limit_value', (v_exceeded->>'limit_nanos')::bigint,
      'reset_at', v_exceeded->'reset_at',
      'now', to_jsonb(v_now),
      'budgets', v_result
    );
  end if;

  return jsonb_build_object('ok', true, 'reason', null, 'now', to_jsonb(v_now), 'budgets', v_result);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_workspace_budget_status"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";
