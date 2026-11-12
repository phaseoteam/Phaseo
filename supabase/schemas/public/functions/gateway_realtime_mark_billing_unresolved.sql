CREATE OR REPLACE FUNCTION public.gateway_realtime_mark_billing_unresolved (
  p_workspace_id          uuid,
  p_session_id            text,
  p_usage                 jsonb,
  p_reason                text,
  p_confirmed_cost_nanos  bigint DEFAULT 0
)
  RETURNS SETOF public.gateway_realtime_sessions
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_session public.gateway_realtime_sessions%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_wallet_found boolean;
  v_held bigint;
  v_capture bigint := 0;
  v_remaining bigint;
  v_row_capture bigint;
  v_captured_total bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
begin
  select * into v_session
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id;
  if not found then raise exception 'realtime_session_not_found'; end if;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return next v_session;
    return;
  end if;

  -- Same lock order as settlement: reservations, wallet, session.
  perform 1 from public.gateway_wallet_reservations r
  where r.workspace_id = p_workspace_id and r.status in ('held', 'reserved')
    and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%')
  order by r.created_at, r.reservation_id
  for update;
  perform 1 from public.wallets where workspace_id = p_workspace_id for update;
  v_wallet_found := found;
  select * into v_session
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id
  for update;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return next v_session;
    return;
  end if;

  -- Capture the provider-confirmed portion now, from the session holds, so a
  -- review only has to decide the unconfirmed remainder.
  v_capture := greatest(0, coalesce(p_confirmed_cost_nanos, 0) - coalesce(v_session.captured_nanos, 0));
  if v_capture > 0 and v_wallet_found then
    select coalesce(sum(r.amount_nanos), 0)::bigint into v_held
    from public.gateway_wallet_reservations r
    where r.workspace_id = p_workspace_id and r.status in ('held', 'reserved')
      and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%');
    select w.balance_nanos, w.reserved_nanos into v_before_balance, v_before_reserved
    from public.wallets w where w.workspace_id = p_workspace_id;
    v_capture := least(v_capture, v_held, greatest(0, coalesce(v_before_reserved, 0)));
  else
    v_capture := 0;
  end if;

  if v_capture > 0 then
    v_captured_total := coalesce(v_session.captured_nanos, 0) + v_capture;
    v_remaining := v_capture;
    for v_reservation in
      select r.* from public.gateway_wallet_reservations r
      where r.workspace_id = p_workspace_id and r.status in ('held', 'reserved')
        and (r.hold_ref_id = p_session_id or r.reservation_id like v_session.reservation_prefix || '%')
      order by r.created_at, r.reservation_id
      for update
    loop
      exit when v_remaining <= 0;
      v_row_capture := least(v_reservation.amount_nanos, v_remaining);
      if v_row_capture = v_reservation.amount_nanos then
        update public.gateway_wallet_reservations
        set status = 'captured', captured_nanos = v_row_capture, released_nanos = 0,
            capture_ref_id = p_session_id, captured_at = now(), updated_at = now()
        where workspace_id = p_workspace_id and reservation_id = v_reservation.reservation_id;
      else
        -- Split the hold: the captured part becomes its own captured row.
        update public.gateway_wallet_reservations
        set amount_nanos = v_reservation.amount_nanos - v_row_capture, updated_at = now()
        where workspace_id = p_workspace_id and reservation_id = v_reservation.reservation_id;
        insert into public.gateway_wallet_reservations (
          reservation_id, workspace_id, amount_nanos, status, hold_ref_id, capture_ref_id,
          captured_nanos, released_nanos, captured_at, created_at, updated_at
        ) values (
          v_session.reservation_prefix || 'confirmed:' || v_captured_total::text, p_workspace_id,
          v_row_capture, 'captured', p_session_id, p_session_id, v_row_capture, 0, now(), now(), now()
        );
      end if;
      v_remaining := v_remaining - v_row_capture;
    end loop;

    update public.wallets
    set balance_nanos = balance_nanos - v_capture,
        reserved_nanos = greatest(0, reserved_nanos - v_capture),
        updated_at = now()
    where workspace_id = p_workspace_id;

    insert into public.credit_ledger (
      workspace_id, event_time, kind, amount_nanos, before_balance_nanos,
      after_balance_nanos, before_reserved_nanos, after_reserved_nanos,
      ref_type, ref_id, created_at, status
    ) values (
      p_workspace_id, now(), 'charge', -v_capture, v_before_balance,
      v_before_balance - v_capture, v_before_reserved, greatest(0, v_before_reserved - v_capture),
      'realtime_session', p_session_id || ':confirmed:' || v_captured_total::text, now(), 'captured'
    ) on conflict (ref_type, ref_id) do nothing;
  end if;

  update public.gateway_realtime_sessions
  set status = 'billing_unresolved',
      usage = coalesce(p_usage, '{}'::jsonb),
      captured_nanos = coalesce(captured_nanos, 0) + v_capture,
      disconnect_reason = left(coalesce(nullif(trim(p_reason), ''), 'authoritative_usage_missing'), 240),
      error_code = 'realtime_authoritative_usage_missing',
      last_event_at = now(),
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  update public.gateway_requests
  set status_code = 202,
      success = false,
      error_code = 'realtime_authoritative_usage_missing',
      error_message = 'Realtime billing requires reconciliation.',
      usage = coalesce(p_usage, '{}'::jsonb),
      cost_nanos = v_session.captured_nanos
  where realtime_session_id = p_session_id
    and created_at = v_session.started_at;

  return next v_session;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_realtime_mark_billing_unresolved"(uuid, text, jsonb, text, bigint) FROM PUBLIC, "anon", "authenticated";
