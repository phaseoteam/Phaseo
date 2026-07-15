-- Make realtime session holds and settlement atomic, auditable, and isolated
-- from funds reserved by other gateway operations.

alter table public.gateway_wallet_reservations
  add column if not exists captured_nanos bigint not null default 0,
  add column if not exists released_nanos bigint not null default 0,
  add column if not exists captured_at timestamptz null,
  add column if not exists released_at timestamptz null;
alter table public.gateway_wallet_reservations
  drop constraint if exists gateway_wallet_reservations_capture_amount_check;
alter table public.gateway_wallet_reservations
  add constraint gateway_wallet_reservations_capture_amount_check
  check (
    captured_nanos >= 0
    and released_nanos >= 0
    and captured_nanos + released_nanos <= amount_nanos
  );
alter table public.gateway_requests
  add column if not exists realtime_session_id text null;
drop index if exists public.gateway_requests_realtime_session_id_key;
create unique index gateway_requests_realtime_session_id_key
  on public.gateway_requests (realtime_session_id, created_at);
drop policy if exists gateway_realtime_sessions_select_own_workspace
  on public.gateway_realtime_sessions;
revoke select on public.gateway_realtime_sessions from authenticated;
create or replace function public.gateway_realtime_create_with_hold(
  p_workspace_id uuid,
  p_session_id text,
  p_key_id uuid,
  p_user_id text,
  p_source text,
  p_provider text,
  p_model_id text,
  p_provider_model_id text,
  p_voice text,
  p_expires_at timestamptz,
  p_reservation_prefix text,
  p_reservation_id text,
  p_hold_nanos bigint,
  p_client_secret_hash text,
  p_metadata jsonb default '{}'::jsonb
)
returns setof public.gateway_realtime_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_session public.gateway_realtime_sessions%rowtype;
begin
  if p_workspace_id is null or coalesce(trim(p_session_id), '') = '' then
    raise exception 'invalid_realtime_session_identity';
  end if;
  if p_hold_nanos is null or p_hold_nanos <= 0 then
    raise exception 'invalid_realtime_hold';
  end if;
  if p_source not in ('api', 'chat') then
    raise exception 'invalid_realtime_source';
  end if;

  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;
  if coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0) < p_hold_nanos then
    raise exception 'insufficient_funds';
  end if;

  insert into public.gateway_realtime_sessions (
    session_id, workspace_id, key_id, user_id, source, provider, model_id,
    provider_model_id, voice, status, expires_at, reservation_prefix,
    reservation_count, reserved_nanos, provider_client_secret_hash, metadata
  ) values (
    p_session_id, p_workspace_id, p_key_id, p_user_id, p_source, p_provider,
    p_model_id, p_provider_model_id, p_voice, 'created', p_expires_at,
    p_reservation_prefix, 1, p_hold_nanos, p_client_secret_hash,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_session;

  insert into public.gateway_wallet_reservations (
    reservation_id, workspace_id, amount_nanos, status, hold_ref_id,
    captured_nanos, released_nanos, created_at, updated_at
  ) values (
    p_reservation_id, p_workspace_id, p_hold_nanos, 'reserved', p_session_id,
    0, 0, now(), now()
  );

  insert into public.gateway_requests (
    workspace_id, request_id, realtime_session_id, endpoint, model_id, provider,
    stream, byok, status_code, success, usage, cost_nanos, currency,
    pricing_lines, key_id, created_at
  ) values (
    p_workspace_id, 'realtime:' || p_session_id, p_session_id, 'audio.realtime',
    p_model_id, p_provider, true, false, 102, false, '{}'::jsonb, 0, 'USD',
    '[]'::jsonb, p_key_id, v_session.started_at
  );

  update public.wallets
  set reserved_nanos = coalesce(reserved_nanos, 0) + p_hold_nanos,
      updated_at = now()
  where workspace_id = p_workspace_id;

  return next v_session;
end;
$$;
revoke all on function public.gateway_realtime_create_with_hold(uuid, text, uuid, text, text, text, text, text, text, timestamptz, text, text, bigint, text, jsonb) from public;
grant execute on function public.gateway_realtime_create_with_hold(uuid, text, uuid, text, text, text, text, text, text, timestamptz, text, text, bigint, text, jsonb) to service_role;
create or replace function public.gateway_realtime_extend_hold_once(
  p_workspace_id uuid,
  p_session_id text,
  p_reservation_id text,
  p_target_reserved_nanos bigint,
  p_estimated_cost_nanos bigint default 0
)
returns setof public.gateway_realtime_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_session public.gateway_realtime_sessions%rowtype;
  v_additional bigint;
begin
  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'wallet_not_found'; end if;

  select * into v_session
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id and session_id = p_session_id
  for update;
  if not found then raise exception 'realtime_session_not_found'; end if;
  if v_session.status not in ('created', 'connected', 'ending') then
    raise exception 'realtime_session_terminal';
  end if;

  v_additional := greatest(0, coalesce(p_target_reserved_nanos, 0) - coalesce(v_session.reserved_nanos, 0));
  if v_additional > 0 then
    if coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0) < v_additional then
      update public.gateway_realtime_sessions
      set status = 'ending', disconnect_reason = 'credit_hold_extension_failed',
          error_code = 'insufficient_funds', updated_at = now()
      where id = v_session.id;
      raise exception 'insufficient_funds';
    end if;

    insert into public.gateway_wallet_reservations (
      reservation_id, workspace_id, amount_nanos, status, hold_ref_id,
      captured_nanos, released_nanos, created_at, updated_at
    ) values (
      p_reservation_id, p_workspace_id, v_additional, 'reserved', p_session_id,
      0, 0, now(), now()
    );
    update public.wallets
    set reserved_nanos = coalesce(reserved_nanos, 0) + v_additional,
        updated_at = now()
    where workspace_id = p_workspace_id;
  end if;

  update public.gateway_realtime_sessions
  set reservation_count = reservation_count + case when v_additional > 0 then 1 else 0 end,
      reserved_nanos = reserved_nanos + v_additional,
      estimated_cost_nanos = greatest(estimated_cost_nanos, coalesce(p_estimated_cost_nanos, 0)),
      last_event_at = now(), updated_at = now()
  where id = v_session.id
  returning * into v_session;

  return next v_session;
end;
$$;
revoke all on function public.gateway_realtime_extend_hold_once(uuid, text, text, bigint, bigint) from public;
grant execute on function public.gateway_realtime_extend_hold_once(uuid, text, text, bigint, bigint) to service_role;
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

  update public.wallets
  set balance_nanos = balance_nanos - v_cost,
      reserved_nanos = reserved_nanos - v_held,
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

