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
-- Admission check for the department budgets that p_key_id counts toward
-- (private.department_budget_key_departments), the sibling of gateway_workspace_budget_status.
-- A budget blocks once its usage reaches the limit, or, with p_requested_amount_nanos > 0, when
-- usage plus the request would exceed it. Usage this UTC period is the successful
-- gateway_requests rows of the department's keys plus their unpaid wallet holds, counted as
-- gateway_workspace_budget_status counts them: batch_hold_usage rows of a hold that is still
-- reserved count once, as the hold. The SpendLimit Durable Object enforces the same budgets for
-- ordinary requests; this covers batch, video and realtime holds and the request-context fallback.
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

  with department_keys as (
    select kd.key_id, kd.department_id
    from private.department_budget_key_departments(p_workspace_id) kd
  ), budgets as (
    select b.id, b.department_id, d.name as department_name, b.interval, b.limit_nanos, p.period_start, p.reset_at
    from public.workspace_department_budgets b
    join public.workspace_departments d on d.id = b.department_id
    cross join lateral private.spend_limit_period(b.interval, v_now) p
    where b.workspace_id = p_workspace_id
      and b.department_id in (select dk.department_id from department_keys dk where dk.key_id = p_key_id)
  ), budget_keys as (
    select distinct dk.key_id
    from department_keys dk
    where dk.department_id in (select budgets.department_id from budgets)
  ), spend as (
    select request.key_id, request.created_at as at, false as always, coalesce(request.cost_nanos, 0) as nanos
    from public.gateway_requests request
    where request.workspace_id = p_workspace_id
      and request.key_id in (select budget_keys.key_id from budget_keys)
      and request.success is true
      and request.created_at >= (select min(budgets.period_start) from budgets)
      and not (request.request_id like 'batch_hold_usage:%' and exists (
        select 1 from public.gateway_wallet_reservations hold
        where hold.workspace_id = request.workspace_id
          and hold.key_id = request.key_id
          and hold.status = 'reserved'
          and starts_with(request.request_id, 'batch_hold_usage:' || hold.reservation_id || ':')
      ))
    union all
    -- Realtime holds carry no key; their session does.
    select coalesce(reservation.key_id, session.key_id), reservation.created_at,
      reservation.reservation_id like 'free_model_hold:%' and reservation.status in ('held', 'reserved'),
      case
        when reservation.reservation_id like 'free_model_hold:%' then
          greatest(0, (case when reservation.status = 'captured'
            then coalesce(reservation.settled_amount_nanos, reservation.amount_nanos)
            else reservation.amount_nanos end) - coalesce(free_audit.cost, 0))
        else greatest(0, reservation.amount_nanos - coalesce(reservation.captured_nanos, 0) - coalesce(reservation.released_nanos, 0))
      end
    from public.gateway_wallet_reservations reservation
    left join public.gateway_realtime_sessions session
      on reservation.key_id is null
      and session.workspace_id = reservation.workspace_id
      and session.session_id = reservation.hold_ref_id
    left join lateral (
      select sum(request.cost_nanos) as cost from public.gateway_requests request
      where reservation.reservation_id like 'free_model_hold:%'
        and request.workspace_id = reservation.workspace_id
        and request.key_id = reservation.key_id
        and request.request_id = reservation.hold_ref_id
        and request.detail_metadata->>'free_model_fee_request_id' = substr(reservation.reservation_id, 17) and request.success is true
    ) free_audit on true
    where reservation.workspace_id = p_workspace_id
      and coalesce(reservation.key_id, session.key_id) in (select budget_keys.key_id from budget_keys)
      and (reservation.status = 'reserved' or (reservation.reservation_id like 'free_model_hold:%'
        and reservation.status in ('held', 'reserved', 'captured')))
  ), usage as (
    select budgets.id, coalesce(sum(spend.nanos), 0)::bigint as usage_nanos
    from budgets
    left join department_keys dk on dk.department_id = budgets.department_id
    left join spend on spend.key_id = dk.key_id and (spend.always or spend.at >= budgets.period_start)
    group by budgets.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', budgets.id,
    'department_id', budgets.department_id,
    'department_name', budgets.department_name,
    'interval', budgets.interval,
    'limit_nanos', budgets.limit_nanos,
    'usage_nanos', usage.usage_nanos,
    'remaining_nanos', greatest(budgets.limit_nanos - usage.usage_nanos, 0),
    'exceeded', case
      when coalesce(p_requested_amount_nanos, 0) > 0 then usage.usage_nanos + p_requested_amount_nanos > budgets.limit_nanos
      else usage.usage_nanos >= budgets.limit_nanos
    end,
    'window_start', budgets.period_start,
    'reset_at', budgets.reset_at
  ) order by case budgets.interval when 'daily' then 1 when 'weekly' then 2 else 3 end,
    budgets.department_name, budgets.department_id), '[]'::jsonb)
  into v_result
  from budgets
  join usage on usage.id = budgets.id;

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

COMMENT ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) IS 'Admission check for the department budgets an API key counts toward: completed spend plus unpaid wallet holds of the department''s keys this UTC period, with the same result shape as gateway_workspace_budget_status and department_<window>_cost_budget_reached reasons.';

REVOKE ALL ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_department_budget_status"(uuid, uuid, bigint) FROM PUBLIC, "anon", "authenticated";
