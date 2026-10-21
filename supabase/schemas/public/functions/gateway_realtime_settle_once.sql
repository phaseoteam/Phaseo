CREATE OR REPLACE FUNCTION public.gateway_realtime_settle_once (
  p_workspace_id      uuid,
  p_session_id        text,
  p_final_cost_nanos  bigint,
  p_usage             jsonb   DEFAULT '{}'::jsonb,
  p_pricing_lines     jsonb   DEFAULT '[]'::jsonb,
  p_status            text    DEFAULT 'completed'::text,
  p_disconnect_reason text    DEFAULT NULL::text,
  p_error_code        text    DEFAULT NULL::text,
  p_error_message     text    DEFAULT NULL::text,
  p_estimated         boolean DEFAULT false,
  p_estimate_basis    text    DEFAULT NULL::text
)
  RETURNS TABLE (
    applied               boolean,
    already_applied       boolean,
    status                text,
    final_cost_nanos      bigint,
    reserved_nanos        bigint,
    captured_nanos        bigint,
    released_nanos        bigint,
    before_balance_nanos  bigint,
    after_balance_nanos   bigint,
    before_reserved_nanos bigint,
    after_reserved_nanos  bigint,
    debt_nanos            bigint,
    uncollected_nanos     bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  -- REALTIME_MAX_OVERDRAFT_NANOS: a settlement may leave the wallet at most $1 negative.
  c_max_overdraft_nanos constant bigint := 1000000000;
  v_session public.gateway_realtime_sessions%rowtype;
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_cost bigint := greatest(0, coalesce(p_final_cost_nanos, 0));
  v_held bigint := 0;
  v_prepaid bigint := 0;
  v_total bigint;
  v_due bigint;
  v_free bigint;
  v_release bigint;
  v_charge bigint;
  v_debt bigint;
  v_uncollected bigint;
  v_anomaly text;
  v_capture_remaining bigint;
  v_row_capture bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_request_count integer;
  v_next_status text := lower(coalesce(nullif(trim(p_status), ''), 'completed'));
begin
  if v_next_status not in ('completed', 'failed', 'cancelled', 'expired') then
    raise exception 'invalid_realtime_terminal_status';
  end if;

  select * into v_session from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id;
  if not found then
    return query select false, false, 'not_found'::text, 0::bigint, 0::bigint,
      0::bigint, 0::bigint, null::bigint, null::bigint, null::bigint, null::bigint, 0::bigint, 0::bigint;
    return;
  end if;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return query select false, true, v_session.status, coalesce(v_session.final_cost_nanos, 0),
      v_session.reserved_nanos, v_session.captured_nanos, v_session.released_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint, v_session.debt_nanos, v_session.uncollected_nanos;
    return;
  end if;

  perform 1 from public.gateway_wallet_reservations gwr
  where gwr.workspace_id = p_workspace_id and gwr.status in ('held', 'reserved')
    and (gwr.hold_ref_id = p_session_id or gwr.reservation_id like v_session.reservation_prefix || '%')
  order by gwr.created_at, gwr.reservation_id
  for update;

  select * into v_wallet from public.wallets
  where workspace_id = p_workspace_id for update;
  if not found then raise exception 'wallet_not_found'; end if;

  select * into v_session from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id for update;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return query select false, true, v_session.status, coalesce(v_session.final_cost_nanos, 0),
      v_session.reserved_nanos, v_session.captured_nanos, v_session.released_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint, v_session.debt_nanos, v_session.uncollected_nanos;
    return;
  end if;

  select coalesce(sum(gwr.amount_nanos), 0)::bigint into v_held
  from public.gateway_wallet_reservations gwr
  where gwr.workspace_id = p_workspace_id and gwr.status in ('held', 'reserved')
    and (gwr.hold_ref_id = p_session_id or gwr.reservation_id like v_session.reservation_prefix || '%');

  -- Confirmed usage may already have been captured when the session entered
  -- billing review; only the remainder is charged now, and never refunded.
  v_prepaid := greatest(0, coalesce(v_session.captured_nanos, 0));
  v_total := greatest(v_cost, v_prepaid);
  v_due := v_total - v_prepaid;

  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);
  v_release := v_held;
  if v_before_reserved < v_held then
    -- Clamp instead of failing forever: the session holds are still released.
    v_anomaly := 'reserved_balance_mismatch';
    v_release := greatest(0, v_before_reserved);
    raise warning 'realtime_settlement_reserved_balance_mismatch session=% held=% wallet_reserved=%',
      p_session_id, v_held, v_before_reserved;
  end if;

  -- Charge the full cost from the holds and free balance. Beyond that the
  -- wallet may go negative up to the overdraft cap (recorded as debt); any
  -- remainder is recorded as uncollected instead of retrying settlement.
  v_free := v_before_balance - v_before_reserved;
  v_charge := least(v_due, greatest(v_release, v_free + v_release + c_max_overdraft_nanos));
  v_uncollected := v_due - v_charge;
  v_debt := greatest(0, v_charge - v_release - greatest(0, v_free));
  if v_uncollected > 0 then
    v_anomaly := coalesce(v_anomaly || ',', '') || 'overdraft_cap_reached';
    raise warning 'realtime_settlement_overdraft_cap_reached session=% uncollected=%', p_session_id, v_uncollected;
  end if;

  update public.wallets w
  set balance_nanos = w.balance_nanos - v_charge,
      reserved_nanos = greatest(0, w.reserved_nanos - v_held),
      updated_at = now()
  where workspace_id = p_workspace_id;

  v_capture_remaining := least(v_charge, v_held);
  for v_reservation in
    select gwr.* from public.gateway_wallet_reservations gwr
    where gwr.workspace_id = p_workspace_id and gwr.status in ('held', 'reserved')
      and (gwr.hold_ref_id = p_session_id or gwr.reservation_id like v_session.reservation_prefix || '%')
    order by gwr.created_at, gwr.reservation_id
    for update
  loop
    v_row_capture := least(v_reservation.amount_nanos, v_capture_remaining);
    update public.gateway_wallet_reservations
    set status = case when v_row_capture > 0 then 'captured' else 'released' end,
        captured_nanos = v_row_capture,
        released_nanos = v_reservation.amount_nanos - v_row_capture,
        capture_ref_id = case when v_row_capture > 0 then p_session_id else null end,
        release_ref_id = case when v_row_capture < v_reservation.amount_nanos then p_session_id else null end,
        captured_at = case when v_row_capture > 0 then now() else null end,
        released_at = case when v_row_capture < v_reservation.amount_nanos then now() else null end,
        updated_at = now()
    where workspace_id = p_workspace_id and reservation_id = v_reservation.reservation_id;
    v_capture_remaining := greatest(0, v_capture_remaining - v_row_capture);
  end loop;

  if v_charge > 0 then
    insert into public.credit_ledger (
      workspace_id, event_time, kind, amount_nanos, before_balance_nanos,
      after_balance_nanos, before_reserved_nanos, after_reserved_nanos,
      ref_type, ref_id, created_at, status
    ) values (
      p_workspace_id, now(), 'charge', -v_charge, v_before_balance,
      v_before_balance - v_charge, v_before_reserved, greatest(0, v_before_reserved - v_held),
      'realtime_session', p_session_id, now(), 'captured'
    ) on conflict (ref_type, ref_id) do nothing;
  end if;

  update public.gateway_realtime_sessions
  set status = v_next_status,
      ended_at = coalesce(ended_at, now()),
      final_cost_nanos = v_total,
      captured_nanos = v_prepaid + v_charge,
      released_nanos = greatest(0, v_held - least(v_charge, v_held)),
      reserved_nanos = greatest(coalesce(v_session.reserved_nanos, 0), v_held),
      usage = coalesce(p_usage, '{}'::jsonb),
      pricing_lines = case when jsonb_typeof(coalesce(p_pricing_lines, '[]'::jsonb)) = 'array'
        then p_pricing_lines else '[]'::jsonb end,
      disconnect_reason = nullif(trim(coalesce(p_disconnect_reason, '')), ''),
      error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      error_message = nullif(trim(coalesce(p_error_message, '')), ''),
      billing_estimated = coalesce(p_estimated, false),
      estimate_basis = case when coalesce(p_estimated, false)
        then left(coalesce(nullif(trim(p_estimate_basis), ''), 'metered_audio'), 120) end,
      debt_nanos = v_debt,
      uncollected_nanos = v_uncollected,
      billing_anomaly = v_anomaly,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  update public.gateway_requests
  set native_response_id = coalesce(v_session.provider_session_id, v_session.provider_native_id),
      status_code = case when v_next_status = 'completed' then 200 else 499 end,
      success = v_next_status = 'completed',
      error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      error_message = nullif(trim(coalesce(p_error_message, '')), ''),
      generation_ms = greatest(0, floor(extract(epoch from (v_session.ended_at - v_session.started_at)) * 1000))::integer,
      usage = coalesce(p_usage, '{}'::jsonb),
      cost_nanos = v_prepaid + v_charge,
      currency = 'USD',
      pricing_lines = case when jsonb_typeof(coalesce(p_pricing_lines, '[]'::jsonb)) = 'array'
        then p_pricing_lines else '[]'::jsonb end
  where realtime_session_id = p_session_id
    and created_at = v_session.started_at;
  get diagnostics v_request_count = row_count;
  if v_request_count <> 1 then
    raise exception 'realtime_request_summary_missing';
  end if;

  return query select true, false, v_session.status, v_total, v_held, v_prepaid + v_charge,
    greatest(0, v_held - least(v_charge, v_held)), v_before_balance,
    v_before_balance - v_charge, v_before_reserved, greatest(0, v_before_reserved - v_held),
    v_debt, v_uncollected;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_settle_once"(uuid, text, bigint, jsonb, jsonb, text, text, text, text, boolean, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_settle_once"(uuid, text, bigint, jsonb, jsonb, text, text, text, text, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_settle_once"(uuid, text, bigint, jsonb, jsonb, text, text, text, text, boolean, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_settle_once"(uuid, text, bigint, jsonb, jsonb, text, text, text, text, boolean, text) FROM PUBLIC, "anon", "authenticated";
