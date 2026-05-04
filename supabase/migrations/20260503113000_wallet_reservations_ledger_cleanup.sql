-- Keep credit_ledger focused on actual balance-affecting purchase/refund/charge
-- events. Async hold state belongs in gateway_wallet_reservations plus
-- wallets.reserved_nanos, not as synthetic ledger rows.

delete from public.credit_ledger
where ref_type in (
  'wallet_reservation_hold',
  'wallet_reservation_capture',
  'wallet_reservation_release'
);

drop function if exists public.gateway_wallet_reserve_once(uuid, text, bigint, text);
drop function if exists public.gateway_wallet_capture_once(uuid, text, text);
drop function if exists public.gateway_wallet_release_once(uuid, text, text);

create or replace function public.gateway_wallet_reserve_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_amount_nanos bigint,
  p_hold_ref_id text default null
)
returns table(
  applied boolean,
  already_applied boolean,
  status text,
  amount_nanos bigint,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  before_reserved_nanos bigint,
  after_reserved_nanos bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_available bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
begin
  if p_workspace_id is null then
    raise exception 'missing_workspace_id';
  end if;
  if coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'missing_reservation_id';
  end if;
  if p_amount_nanos is null or p_amount_nanos <= 0 then
    raise exception 'invalid_amount_nanos';
  end if;

  select *
  into v_reservation
  from public.gateway_wallet_reservations
  where workspace_id = p_workspace_id
    and reservation_id = p_reservation_id
  for update;

  if found then
    if v_reservation.amount_nanos <> p_amount_nanos then
      raise exception 'reservation_amount_mismatch';
    end if;
    if v_reservation.status = 'held' then
      select * into v_wallet from public.wallets where workspace_id = p_workspace_id;
      return query
      select
        false,
        true,
        'held'::text,
        v_reservation.amount_nanos,
        coalesce(v_wallet.balance_nanos, 0)::bigint,
        coalesce(v_wallet.balance_nanos, 0)::bigint,
        coalesce(v_wallet.reserved_nanos, 0)::bigint,
        coalesce(v_wallet.reserved_nanos, 0)::bigint;
      return;
    end if;

    return query
    select
      false,
      true,
      v_reservation.status::text,
      v_reservation.amount_nanos,
      null::bigint,
      null::bigint,
      null::bigint,
      null::bigint;
    return;
  end if;

  select *
  into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  v_available := coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0);
  if v_available < p_amount_nanos then
    return query
    select
      false,
      false,
      'insufficient_funds'::text,
      p_amount_nanos,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  insert into public.gateway_wallet_reservations (
    workspace_id,
    reservation_id,
    amount_nanos,
    status,
    hold_ref_id,
    created_at,
    updated_at
  ) values (
    p_workspace_id,
    p_reservation_id,
    p_amount_nanos,
    'held',
    nullif(trim(coalesce(p_hold_ref_id, '')), ''),
    now(),
    now()
  )
  on conflict (workspace_id, reservation_id) do nothing
  returning *
  into v_reservation;

  if not found then
    select *
    into v_reservation
    from public.gateway_wallet_reservations
    where workspace_id = p_workspace_id
      and reservation_id = p_reservation_id
    for update;

    if not found then
      raise exception 'reservation_insert_failed';
    end if;
    if v_reservation.amount_nanos <> p_amount_nanos then
      raise exception 'reservation_amount_mismatch';
    end if;

    if v_reservation.status = 'held' then
      return query
      select
        false,
        true,
        'held'::text,
        v_reservation.amount_nanos,
        coalesce(v_wallet.balance_nanos, 0)::bigint,
        coalesce(v_wallet.balance_nanos, 0)::bigint,
        coalesce(v_wallet.reserved_nanos, 0)::bigint,
        coalesce(v_wallet.reserved_nanos, 0)::bigint;
      return;
    end if;

    return query
    select
      false,
      true,
      v_reservation.status::text,
      v_reservation.amount_nanos,
      null::bigint,
      null::bigint,
      null::bigint,
      null::bigint;
    return;
  end if;

  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);

  update public.wallets
  set reserved_nanos = reserved_nanos + p_amount_nanos,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning *
  into v_wallet;

  return query
  select
    true,
    false,
    'held'::text,
    p_amount_nanos,
    v_before_balance,
    v_before_balance,
    v_before_reserved,
    v_before_reserved + p_amount_nanos;
end;
$$;

create or replace function public.gateway_wallet_capture_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_capture_ref_id text default null
)
returns table(
  applied boolean,
  already_applied boolean,
  status text,
  amount_nanos bigint,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  before_reserved_nanos bigint,
  after_reserved_nanos bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_amount bigint;
begin
  if p_workspace_id is null then
    raise exception 'missing_workspace_id';
  end if;
  if coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'missing_reservation_id';
  end if;

  select *
  into v_reservation
  from public.gateway_wallet_reservations
  where workspace_id = p_workspace_id
    and reservation_id = p_reservation_id
  for update;

  if not found then
    return query select false, false, 'not_found'::text, 0::bigint, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_reservation.status = 'captured' then
    return query
    select false, true, 'captured'::text, v_reservation.amount_nanos, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_reservation.status = 'released' then
    return query
    select false, true, 'released'::text, v_reservation.amount_nanos, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  v_amount := v_reservation.amount_nanos;

  select *
  into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if coalesce(v_wallet.reserved_nanos, 0) < v_amount then
    return query
    select false, false, 'reserved_balance_mismatch'::text, v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos, v_wallet.reserved_nanos, v_wallet.reserved_nanos;
    return;
  end if;

  update public.wallets
  set balance_nanos = balance_nanos - v_amount,
      reserved_nanos = reserved_nanos - v_amount,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning *
  into v_wallet;

  update public.gateway_wallet_reservations
  set status = 'captured',
      capture_ref_id = nullif(trim(coalesce(p_capture_ref_id, '')), ''),
      updated_at = now()
  where workspace_id = p_workspace_id
    and reservation_id = p_reservation_id;

  return query
  select
    true,
    false,
    'captured'::text,
    v_amount,
    v_wallet.balance_nanos + v_amount,
    v_wallet.balance_nanos,
    v_wallet.reserved_nanos + v_amount,
    v_wallet.reserved_nanos;
end;
$$;

create or replace function public.gateway_wallet_release_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_release_ref_id text default null
)
returns table(
  applied boolean,
  already_applied boolean,
  status text,
  amount_nanos bigint,
  before_balance_nanos bigint,
  after_balance_nanos bigint,
  before_reserved_nanos bigint,
  after_reserved_nanos bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_amount bigint;
begin
  if p_workspace_id is null then
    raise exception 'missing_workspace_id';
  end if;
  if coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'missing_reservation_id';
  end if;

  select *
  into v_reservation
  from public.gateway_wallet_reservations
  where workspace_id = p_workspace_id
    and reservation_id = p_reservation_id
  for update;

  if not found then
    return query select false, false, 'not_found'::text, 0::bigint, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_reservation.status = 'released' then
    return query
    select false, true, 'released'::text, v_reservation.amount_nanos, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  if v_reservation.status = 'captured' then
    return query
    select false, true, 'captured'::text, v_reservation.amount_nanos, null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  v_amount := v_reservation.amount_nanos;

  select *
  into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if coalesce(v_wallet.reserved_nanos, 0) < v_amount then
    return query
    select false, false, 'reserved_balance_mismatch'::text, v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos, v_wallet.reserved_nanos, v_wallet.reserved_nanos;
    return;
  end if;

  update public.wallets
  set reserved_nanos = reserved_nanos - v_amount,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning *
  into v_wallet;

  update public.gateway_wallet_reservations
  set status = 'released',
      release_ref_id = nullif(trim(coalesce(p_release_ref_id, '')), ''),
      updated_at = now()
  where workspace_id = p_workspace_id
    and reservation_id = p_reservation_id;

  return query
  select
    true,
    false,
    'released'::text,
    v_amount,
    v_wallet.balance_nanos,
    v_wallet.balance_nanos,
    v_wallet.reserved_nanos + v_amount,
    v_wallet.reserved_nanos;
end;
$$;

revoke all on function public.gateway_wallet_reserve_once(uuid, text, bigint, text) from public;
revoke all on function public.gateway_wallet_capture_once(uuid, text, text) from public;
revoke all on function public.gateway_wallet_release_once(uuid, text, text) from public;

grant execute on function public.gateway_wallet_reserve_once(uuid, text, bigint, text) to service_role;
grant execute on function public.gateway_wallet_capture_once(uuid, text, text) to service_role;
grant execute on function public.gateway_wallet_release_once(uuid, text, text) to service_role;
