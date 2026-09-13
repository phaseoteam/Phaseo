-- Record actual async debits in the same transaction as wallet settlement.
-- Holds and releases are not charges. No historical balances are changed.

CREATE OR REPLACE FUNCTION public.gateway_wallet_capture_once(p_workspace_id uuid, p_reservation_id text, p_capture_ref_id text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, applied boolean, reason text, amount_nanos bigint, before_balance_nanos bigint, after_balance_nanos bigint, before_reserved_nanos bigint, after_reserved_nanos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.gateway_wallet_reservations%rowtype;
  v_amount bigint;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'reservation_id_required' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.gateway_wallet_reservations
  where reservation_id = p_reservation_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    return query select false, false, 'reservation_not_found'::text, null::bigint,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    return query select false, false, 'wallet_not_found'::text, v_existing.amount_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_existing.status = 'captured' then
    return query select true, false, 'already_captured'::text, v_existing.amount_nanos,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  if v_existing.status <> 'reserved' then
    return query select false, false, 'reservation_not_active'::text, v_existing.amount_nanos,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  v_amount := v_existing.amount_nanos;

  if coalesce(v_wallet.reserved_nanos, 0) < v_amount then
    return query select false, false, 'reserved_balance_mismatch'::text, v_amount,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  update public.wallets
  set balance_nanos = coalesce(balance_nanos, 0) - v_amount,
      reserved_nanos = coalesce(reserved_nanos, 0) - v_amount,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning *
  into v_wallet;

  update public.gateway_wallet_reservations
  set status = 'captured',
      settled_amount_nanos = v_amount,
      captured_nanos = v_amount,
      released_nanos = 0,
      capture_ref_id = nullif(trim(coalesce(p_capture_ref_id, '')), ''),
      captured_at = now(),
      updated_at = now()
  where reservation_id = p_reservation_id
    and workspace_id = p_workspace_id;

  insert into public.credit_ledger (
    workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
    before_reserved_nanos, after_reserved_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status
  ) values (
    p_workspace_id, 'charge', -v_amount, v_wallet.balance_nanos + v_amount, v_wallet.balance_nanos,
    v_wallet.reserved_nanos + v_amount, v_wallet.reserved_nanos,
    'async_job_charge', p_workspace_id::text || ':' || p_reservation_id,
    'async_job', coalesce(nullif(trim(p_capture_ref_id), ''), p_reservation_id), 'captured'
  );

  return query select true, true, null::text, v_amount,
    coalesce(v_wallet.balance_nanos, 0) + v_amount,
    coalesce(v_wallet.balance_nanos, 0),
    coalesce(v_wallet.reserved_nanos, 0) + v_amount,
    coalesce(v_wallet.reserved_nanos, 0);
end;
$function$;
revoke all on function public.gateway_wallet_capture_once(uuid, text, text) from public, anon, authenticated;
grant execute on function public.gateway_wallet_capture_once(uuid, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.gateway_wallet_release_once(p_workspace_id uuid, p_reservation_id text, p_release_ref_id text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, applied boolean, reason text, amount_nanos bigint, before_balance_nanos bigint, after_balance_nanos bigint, before_reserved_nanos bigint, after_reserved_nanos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_existing public.gateway_wallet_reservations%rowtype;
  v_amount bigint;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'reservation_id_required' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.gateway_wallet_reservations
  where reservation_id = p_reservation_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    return query select false, false, 'reservation_not_found'::text, null::bigint,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    return query select false, false, 'wallet_not_found'::text, v_existing.amount_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_existing.status = 'released' then
    return query select true, false, 'already_released'::text, v_existing.amount_nanos,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  if v_existing.status <> 'reserved' then
    return query select false, false, 'reservation_not_active'::text, v_existing.amount_nanos,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  v_amount := v_existing.amount_nanos;

  if coalesce(v_wallet.reserved_nanos, 0) < v_amount then
    return query select false, false, 'reserved_balance_mismatch'::text, v_amount,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  update public.wallets
  set reserved_nanos = coalesce(reserved_nanos, 0) - v_amount,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning *
  into v_wallet;

  update public.gateway_wallet_reservations
  set status = 'released',
      captured_nanos = 0,
      released_nanos = v_amount,
      release_ref_id = nullif(trim(coalesce(p_release_ref_id, '')), ''),
      released_at = now(),
      updated_at = now()
  where reservation_id = p_reservation_id
    and workspace_id = p_workspace_id;

  return query select true, true, null::text, v_amount,
    coalesce(v_wallet.balance_nanos, 0),
    coalesce(v_wallet.balance_nanos, 0),
    coalesce(v_wallet.reserved_nanos, 0) + v_amount,
    coalesce(v_wallet.reserved_nanos, 0);
end;
$function$;
revoke all on function public.gateway_wallet_release_once(uuid, text, text) from public, anon, authenticated;
grant execute on function public.gateway_wallet_release_once(uuid, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.gateway_wallet_settle_once(p_workspace_id uuid, p_reservation_id text, p_actual_nanos bigint, p_settle_ref_id text DEFAULT NULL::text)
 RETURNS TABLE(ok boolean, applied boolean, reason text, amount_nanos bigint, before_balance_nanos bigint, after_balance_nanos bigint, before_reserved_nanos bigint, after_reserved_nanos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_available_for_settlement bigint;
begin
  if p_workspace_id is null or coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'invalid_batch_reservation_identity';
  end if;
  if p_actual_nanos is null or p_actual_nanos < 0 then
    raise exception 'invalid_actual_nanos';
  end if;

  select * into v_reservation
  from public.gateway_wallet_reservations
  where workspace_id = p_workspace_id and reservation_id = p_reservation_id
  for update;
  if not found then
    return query select false, false, 'reservation_not_found'::text, p_actual_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  select * into v_wallet from public.wallets
  where workspace_id = p_workspace_id for update;
  if not found then
    return query select false, false, 'wallet_not_found'::text, p_actual_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_reservation.status = 'captured' then
    if coalesce(v_reservation.settled_amount_nanos, v_reservation.amount_nanos) <> p_actual_nanos then
      raise exception 'reservation_settlement_amount_mismatch';
    end if;
    return query select true, false, 'already_captured'::text, p_actual_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;

  if v_reservation.status not in ('held', 'reserved') then
    return query select false, false, 'reservation_not_active'::text, p_actual_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;
  if coalesce(v_wallet.reserved_nanos, 0) < v_reservation.amount_nanos then
    return query select false, false, 'reserved_balance_mismatch'::text, p_actual_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;

  -- The reservation itself is available to this settlement; all other holds
  -- remain excluded from spendable balance.
  v_available_for_settlement := coalesce(v_wallet.balance_nanos, 0)
    - coalesce(v_wallet.reserved_nanos, 0)
    + v_reservation.amount_nanos;
  if p_actual_nanos > v_available_for_settlement then
    return query select false, false, 'insufficient_balance'::text, p_actual_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;

  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);
  update public.wallets
  set balance_nanos = v_before_balance - p_actual_nanos,
      reserved_nanos = v_before_reserved - v_reservation.amount_nanos,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning * into v_wallet;

  update public.gateway_wallet_reservations
  set status = 'captured',
      settled_amount_nanos = p_actual_nanos,
      captured_nanos = least(p_actual_nanos, v_reservation.amount_nanos),
      released_nanos = greatest(0, v_reservation.amount_nanos - p_actual_nanos),
      capture_ref_id = nullif(trim(coalesce(p_settle_ref_id, '')), ''),
      captured_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id and reservation_id = p_reservation_id;

  if p_actual_nanos > 0 then
    insert into public.credit_ledger (
      workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
      before_reserved_nanos, after_reserved_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status
    ) values (
      p_workspace_id, 'charge', -p_actual_nanos, v_before_balance, v_wallet.balance_nanos,
      v_before_reserved, v_wallet.reserved_nanos,
      'async_job_charge', p_workspace_id::text || ':' || p_reservation_id,
      'async_job', coalesce(nullif(trim(p_settle_ref_id), ''), p_reservation_id), 'captured'
    );
  end if;

  return query select true, true, null::text, p_actual_nanos,
    v_before_balance, coalesce(v_wallet.balance_nanos, 0),
    v_before_reserved, coalesce(v_wallet.reserved_nanos, 0);
end;
$function$;
revoke all on function public.gateway_wallet_settle_once(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.gateway_wallet_settle_once(uuid, text, bigint, text) to service_role;
