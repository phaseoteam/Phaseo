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
  ), request_usage as (
    select
      configured.id,
      coalesce(sum(request.cost_nanos) filter (
        where request.success is true
          and (configured.window_start is null or request.created_at >= configured.window_start)
      ), 0)::bigint as completed_nanos
    from configured
    left join public.gateway_requests request
      on request.workspace_id = configured.workspace_id
    group by configured.id
  ), reservation_usage as (
    select
      configured.id,
      coalesce(sum(case
        when reservation.reservation_id like 'free_model_hold:%' then
          case when reservation.status in ('held', 'reserved') or
            (reservation.status = 'captured' and (configured.window_start is null or reservation.created_at >= configured.window_start))
          then greatest(0, (case when reservation.status = 'captured'
            then coalesce(reservation.settled_amount_nanos, reservation.amount_nanos)
            else reservation.amount_nanos end) - coalesce(free_audit.cost, 0))
          else 0 end
        when reservation.status = 'reserved' and
          (configured.window_start is null or reservation.created_at >= configured.window_start)
        then greatest(0, reservation.amount_nanos - coalesce(reservation.captured_nanos, 0) - coalesce(reservation.released_nanos, 0))
        else 0 end), 0)::bigint as held_nanos
    from configured
    left join public.gateway_wallet_reservations reservation
      on reservation.workspace_id = configured.workspace_id
    left join lateral (
      select sum(request.cost_nanos) as cost from public.gateway_requests request
      where reservation.reservation_id like 'free_model_hold:%'
        and request.workspace_id = reservation.workspace_id
        and request.key_id = reservation.key_id
        and request.request_id = reservation.hold_ref_id
        and request.detail_metadata->>'free_model_fee_request_id' = substr(reservation.reservation_id, 17) and request.success is true
    ) free_audit on true
    group by configured.id
  ), usage_rows as (
    select
      configured.*,
      request_usage.completed_nanos + reservation_usage.held_nanos as usage_nanos
    from configured
    join request_usage using (id)
    join reservation_usage using (id)
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
