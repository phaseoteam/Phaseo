-- Qualify wallet columns that share names with the settlement RPC output.

create or replace function public.gateway_realtime_settle_once(
  p_workspace_id uuid,
  p_session_id text,
  p_final_cost_nanos bigint,
  p_usage jsonb default '{}'::jsonb,
  p_pricing_lines jsonb default '[]'::jsonb,
  p_status text default 'completed',
  p_disconnect_reason text default null,
  p_error_code text default null,
  p_error_message text default null
)
returns table(
  applied boolean, already_applied boolean, status text, final_cost_nanos bigint,
  reserved_nanos bigint, captured_nanos bigint, released_nanos bigint,
  before_balance_nanos bigint, after_balance_nanos bigint,
  before_reserved_nanos bigint, after_reserved_nanos bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.gateway_realtime_sessions%rowtype;
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_cost bigint := greatest(0, coalesce(p_final_cost_nanos, 0));
  v_held bigint := 0;
  v_capture_remaining bigint;
  v_row_capture bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_next_status text := lower(coalesce(nullif(trim(p_status), ''), 'completed'));
begin
  if v_next_status not in ('completed', 'failed', 'cancelled', 'expired') then
    raise exception 'invalid_realtime_terminal_status';
  end if;

  select * into v_session from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id;
  if not found then
    return query select false, false, 'not_found'::text, 0::bigint, 0::bigint,
      0::bigint, 0::bigint, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return query select false, true, v_session.status, coalesce(v_session.final_cost_nanos, 0),
      v_session.reserved_nanos, v_session.captured_nanos, v_session.released_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint;
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
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  select coalesce(sum(gwr.amount_nanos), 0)::bigint into v_held
  from public.gateway_wallet_reservations gwr
  where gwr.workspace_id = p_workspace_id and gwr.status in ('held', 'reserved')
    and (gwr.hold_ref_id = p_session_id or gwr.reservation_id like v_session.reservation_prefix || '%');

  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);
  if v_before_reserved < v_held then
    return query select false, false, 'reserved_balance_mismatch'::text, v_cost, v_held,
      0::bigint, v_held, v_before_balance, v_before_balance, v_before_reserved, v_before_reserved;
    return;
  end if;
  if v_cost > v_held + greatest(0, v_before_balance - v_before_reserved) then
    return query select false, false, 'insufficient_unreserved_balance'::text, v_cost, v_held,
      0::bigint, v_held, v_before_balance, v_before_balance, v_before_reserved, v_before_reserved;
    return;
  end if;

  update public.wallets w
  set balance_nanos = w.balance_nanos - v_cost,
      reserved_nanos = w.reserved_nanos - v_held,
      updated_at = now()
  where workspace_id = p_workspace_id;

  v_capture_remaining := least(v_cost, v_held);
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

  if v_cost > 0 then
    insert into public.credit_ledger (
      workspace_id, event_time, kind, amount_nanos, before_balance_nanos,
      after_balance_nanos, before_reserved_nanos, after_reserved_nanos,
      ref_type, ref_id, created_at, status
    ) values (
      p_workspace_id, now(), 'charge', -v_cost, v_before_balance,
      v_before_balance - v_cost, v_before_reserved, v_before_reserved - v_held,
      'realtime_session', p_session_id, now(), 'captured'
    ) on conflict (ref_type, ref_id) do nothing;
  end if;

  update public.gateway_realtime_sessions
  set status = v_next_status, ended_at = coalesce(ended_at, now()),
      final_cost_nanos = v_cost, captured_nanos = v_cost,
      released_nanos = greatest(0, v_held - least(v_cost, v_held)),
      reserved_nanos = v_held, usage = coalesce(p_usage, '{}'::jsonb),
      pricing_lines = case when jsonb_typeof(coalesce(p_pricing_lines, '[]'::jsonb)) = 'array'
        then p_pricing_lines else '[]'::jsonb end,
      disconnect_reason = nullif(trim(coalesce(p_disconnect_reason, '')), ''),
      error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      error_message = nullif(trim(coalesce(p_error_message, '')), ''), updated_at = now()
  where id = v_session.id returning * into v_session;

  return query select true, false, v_session.status, v_cost, v_held, v_cost,
    greatest(0, v_held - least(v_cost, v_held)), v_before_balance,
    v_before_balance - v_cost, v_before_reserved, v_before_reserved - v_held;
end;
$$;
revoke all on function public.gateway_realtime_settle_once(uuid, text, bigint, jsonb, jsonb, text, text, text, text) from public;
grant execute on function public.gateway_realtime_settle_once(uuid, text, bigint, jsonb, jsonb, text, text, text, text) to service_role;

