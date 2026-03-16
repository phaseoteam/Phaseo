-- Fix race in gateway_wallet_reserve_once:
-- ensure reservation row is inserted before mutating reserved_nanos so
-- duplicate concurrent reserve attempts remain idempotent.

create or replace function public.gateway_wallet_reserve_once(
  p_team_id uuid,
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
  if p_team_id is null then
    raise exception 'missing_team_id';
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
  where team_id = p_team_id
    and reservation_id = p_reservation_id
  for update;

  if found then
    if v_reservation.amount_nanos <> p_amount_nanos then
      raise exception 'reservation_amount_mismatch';
    end if;
    if v_reservation.status = 'held' then
      select * into v_wallet from public.wallets where team_id = p_team_id;
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
  where team_id = p_team_id
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
    team_id,
    reservation_id,
    amount_nanos,
    status,
    hold_ref_id,
    created_at,
    updated_at
  ) values (
    p_team_id,
    p_reservation_id,
    p_amount_nanos,
    'held',
    nullif(trim(coalesce(p_hold_ref_id, '')), ''),
    now(),
    now()
  )
  on conflict (team_id, reservation_id) do nothing
  returning *
  into v_reservation;

  if not found then
    select *
    into v_reservation
    from public.gateway_wallet_reservations
    where team_id = p_team_id
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
  where team_id = p_team_id
  returning *
  into v_wallet;

  insert into public.credit_ledger (
    team_id,
    event_time,
    kind,
    amount_nanos,
    before_balance_nanos,
    after_balance_nanos,
    before_reserved_nanos,
    after_reserved_nanos,
    ref_type,
    ref_id,
    created_at,
    status
  ) values (
    p_team_id,
    now(),
    'hold',
    0,
    v_before_balance,
    v_before_balance,
    v_before_reserved,
    v_before_reserved + p_amount_nanos,
    'wallet_reservation_hold',
    p_reservation_id,
    now(),
    'held'
  ) on conflict (ref_type, ref_id) do nothing;

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

revoke all on function public.gateway_wallet_reserve_once(uuid, text, bigint, text) from public;
grant execute on function public.gateway_wallet_reserve_once(uuid, text, bigint, text) to service_role;
