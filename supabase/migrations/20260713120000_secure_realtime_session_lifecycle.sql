-- Close realtime lifecycle races and make wallet/request finalization atomic.

begin;

alter table public.gateway_realtime_sessions
  drop constraint if exists gateway_realtime_sessions_status_check;
alter table public.gateway_realtime_sessions
  add constraint gateway_realtime_sessions_status_check check (
    status in (
      'created', 'connecting', 'connected', 'ending', 'billing_unresolved',
      'completed', 'failed', 'cancelled', 'expired'
    )
  );

drop function if exists public.gateway_realtime_create_with_hold(
  uuid, text, uuid, text, text, text, text, text, text, timestamptz,
  text, text, bigint, text, jsonb
);

create function public.gateway_realtime_create_with_hold(
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
  p_metadata jsonb default '{}'::jsonb,
  p_max_workspace_sessions integer default 8,
  p_max_key_sessions integer default 4,
  p_max_user_sessions integer default 1,
  p_max_creations_per_minute integer default 8
)
returns setof public.gateway_realtime_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_session public.gateway_realtime_sessions%rowtype;
  v_count integer;
begin
  if p_workspace_id is null or coalesce(trim(p_session_id), '') = '' then
    raise exception 'invalid_realtime_session_identity';
  end if;
  if p_key_id is null then
    raise exception 'invalid_realtime_key';
  end if;
  if p_hold_nanos is null or p_hold_nanos <= 0 then
    raise exception 'invalid_realtime_hold';
  end if;
  if p_source not in ('api', 'chat') then
    raise exception 'invalid_realtime_source';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid_realtime_expiry';
  end if;

  -- The wallet row serializes create/limit checks for the workspace.
  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  select count(*)::integer into v_count
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id
    and status in ('created', 'connecting', 'connected', 'ending', 'billing_unresolved');
  if v_count >= greatest(1, p_max_workspace_sessions) then
    raise exception 'realtime_workspace_concurrency_limit';
  end if;

  select count(*)::integer into v_count
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id
    and key_id = p_key_id
    and status in ('created', 'connecting', 'connected', 'ending', 'billing_unresolved');
  if v_count >= greatest(1, p_max_key_sessions) then
    raise exception 'realtime_key_concurrency_limit';
  end if;

  if nullif(trim(coalesce(p_user_id, '')), '') is not null then
    select count(*)::integer into v_count
    from public.gateway_realtime_sessions
    where workspace_id = p_workspace_id
      and user_id = p_user_id
      and status in ('created', 'connecting', 'connected', 'ending', 'billing_unresolved');
    if v_count >= greatest(1, p_max_user_sessions) then
      raise exception 'realtime_user_concurrency_limit';
    end if;
  end if;

  select count(*)::integer into v_count
  from public.gateway_realtime_sessions
  where workspace_id = p_workspace_id
    and created_at >= now() - interval '1 minute';
  if v_count >= greatest(1, p_max_creations_per_minute) then
    raise exception 'realtime_creation_rate_limit';
  end if;

  if coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0) < p_hold_nanos then
    raise exception 'insufficient_funds';
  end if;

  insert into public.gateway_realtime_sessions (
    session_id, workspace_id, key_id, user_id, source, provider, model_id,
    provider_model_id, voice, status, expires_at, reservation_prefix,
    reservation_count, reserved_nanos, provider_client_secret_hash, metadata
  ) values (
    p_session_id, p_workspace_id, p_key_id, nullif(trim(coalesce(p_user_id, '')), ''),
    p_source, p_provider, p_model_id, p_provider_model_id, p_voice, 'created',
    p_expires_at, p_reservation_prefix, 1, p_hold_nanos,
    p_client_secret_hash, coalesce(p_metadata, '{}'::jsonb)
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

revoke all on function public.gateway_realtime_create_with_hold(
  uuid, text, uuid, text, text, text, text, text, text, timestamptz,
  text, text, bigint, text, jsonb, integer, integer, integer, integer
) from public;
grant execute on function public.gateway_realtime_create_with_hold(
  uuid, text, uuid, text, text, text, text, text, text, timestamptz,
  text, text, bigint, text, jsonb, integer, integer, integer, integer
) to service_role;

create or replace function public.gateway_realtime_claim_connection(
  p_session_id text,
  p_client_secret_hash text
)
returns setof public.gateway_realtime_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.gateway_realtime_sessions%rowtype;
begin
  select * into v_session
  from public.gateway_realtime_sessions
  where session_id = p_session_id
  for update;

  if not found then raise exception 'realtime_session_not_found'; end if;
  if coalesce(v_session.provider_client_secret_hash, '') <> coalesce(p_client_secret_hash, '') then
    raise exception 'realtime_relay_forbidden';
  end if;
  if v_session.status <> 'created' then
    raise exception 'realtime_relay_already_connected';
  end if;
  if v_session.expires_at is not null and v_session.expires_at <= now() then
    raise exception 'realtime_session_expired';
  end if;

  update public.gateway_realtime_sessions
  set status = 'connecting', last_event_at = now(), updated_at = now()
  where id = v_session.id and status = 'created'
  returning * into v_session;

  if not found then raise exception 'realtime_relay_already_connected'; end if;
  return next v_session;
end;
$$;

revoke all on function public.gateway_realtime_claim_connection(text, text) from public;
grant execute on function public.gateway_realtime_claim_connection(text, text) to service_role;

create or replace function public.gateway_realtime_mark_billing_unresolved(
  p_workspace_id uuid,
  p_session_id text,
  p_usage jsonb,
  p_reason text
)
returns setof public.gateway_realtime_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.gateway_realtime_sessions%rowtype;
  v_request_count integer;
begin
  update public.gateway_realtime_sessions
  set status = 'billing_unresolved',
      usage = coalesce(p_usage, '{}'::jsonb),
      disconnect_reason = left(coalesce(nullif(trim(p_reason), ''), 'authoritative_usage_missing'), 240),
      error_code = 'realtime_authoritative_usage_missing',
      last_event_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id
    and session_id = p_session_id
    and status in ('created', 'connecting', 'connected', 'ending', 'billing_unresolved')
  returning * into v_session;

  if not found then
    select * into v_session
    from public.gateway_realtime_sessions
    where workspace_id = p_workspace_id and session_id = p_session_id;
  end if;
  if not found then raise exception 'realtime_session_not_found'; end if;
  if v_session.status in ('completed', 'failed', 'cancelled', 'expired') then
    return next v_session;
    return;
  end if;

  update public.gateway_requests
  set status_code = 202,
      success = false,
      error_code = 'realtime_authoritative_usage_missing',
      error_message = 'Realtime billing requires reconciliation.',
      usage = coalesce(p_usage, '{}'::jsonb)
  where realtime_session_id = p_session_id
    and created_at = v_session.started_at;
  get diagnostics v_request_count = row_count;
  if v_request_count <> 1 then
    raise exception 'realtime_request_summary_missing';
  end if;

  return next v_session;
end;
$$;

revoke all on function public.gateway_realtime_mark_billing_unresolved(uuid, text, jsonb, text) from public;
grant execute on function public.gateway_realtime_mark_billing_unresolved(uuid, text, jsonb, text) to service_role;

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
  set status = v_next_status,
      ended_at = coalesce(ended_at, now()),
      final_cost_nanos = v_cost,
      captured_nanos = v_cost,
      released_nanos = greatest(0, v_held - least(v_cost, v_held)),
      reserved_nanos = v_held,
      usage = coalesce(p_usage, '{}'::jsonb),
      pricing_lines = case when jsonb_typeof(coalesce(p_pricing_lines, '[]'::jsonb)) = 'array'
        then p_pricing_lines else '[]'::jsonb end,
      disconnect_reason = nullif(trim(coalesce(p_disconnect_reason, '')), ''),
      error_code = nullif(trim(coalesce(p_error_code, '')), ''),
      error_message = nullif(trim(coalesce(p_error_message, '')), ''),
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
      cost_nanos = v_cost,
      currency = 'USD',
      pricing_lines = case when jsonb_typeof(coalesce(p_pricing_lines, '[]'::jsonb)) = 'array'
        then p_pricing_lines else '[]'::jsonb end
  where realtime_session_id = p_session_id
    and created_at = v_session.started_at;
  get diagnostics v_request_count = row_count;
  if v_request_count <> 1 then
    raise exception 'realtime_request_summary_missing';
  end if;

  return query select true, false, v_session.status, v_cost, v_held, v_cost,
    greatest(0, v_held - least(v_cost, v_held)), v_before_balance,
    v_before_balance - v_cost, v_before_reserved, v_before_reserved - v_held;
end;
$$;

revoke all on function public.gateway_realtime_settle_once(uuid, text, bigint, jsonb, jsonb, text, text, text, text) from public;
grant execute on function public.gateway_realtime_settle_once(uuid, text, bigint, jsonb, jsonb, text, text, text, text) to service_role;

commit;

