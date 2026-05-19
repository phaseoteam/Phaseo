-- Make wallet reservation arithmetic null-safe for legacy rows.

drop function if exists public.gateway_wallet_reserve_once(uuid, text, bigint, text);
drop function if exists public.gateway_wallet_capture_once(uuid, text, text);
drop function if exists public.gateway_wallet_release_once(uuid, text, text);

create or replace function public.gateway_wallet_reserve_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_amount_nanos bigint,
  p_hold_ref_id text default null
)
returns table (
  ok boolean,
  applied boolean,
  reason text,
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
  v_existing public.gateway_wallet_reservations%rowtype;
  v_available bigint;
  v_before_balance bigint;
  v_before_reserved bigint;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id_required' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'reservation_id_required' using errcode = 'P0001';
  end if;
  if p_amount_nanos is null or p_amount_nanos <= 0 then
    raise exception 'amount_nanos_must_be_positive' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.gateway_wallet_reservations
  where reservation_id = p_reservation_id
    and workspace_id = p_workspace_id
  for update;

  if found then
    select * into v_wallet
    from public.wallets
    where workspace_id = p_workspace_id
    for update;

    if not found then
      return query select false, false, 'wallet_not_found'::text, p_amount_nanos,
        null::bigint, null::bigint, null::bigint, null::bigint;
      return;
    end if;

    if v_existing.status = 'reserved' then
      return query select true, false, 'already_reserved'::text, v_existing.amount_nanos,
        coalesce(v_wallet.balance_nanos, 0)::bigint,
        coalesce(v_wallet.balance_nanos, 0)::bigint,
        coalesce(v_wallet.reserved_nanos, 0)::bigint,
        coalesce(v_wallet.reserved_nanos, 0)::bigint;
      return;
    end if;

    return query select false, false, 'reservation_not_active'::text, v_existing.amount_nanos,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    return query select false, false, 'wallet_not_found'::text, p_amount_nanos,
      null::bigint, null::bigint, null::bigint, null::bigint;
    return;
  end if;

  v_available := coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0);

  if v_available < p_amount_nanos then
    return query select false, false, 'insufficient_balance'::text, p_amount_nanos,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  insert into public.gateway_wallet_reservations (
    reservation_id,
    workspace_id,
    amount_nanos,
    status,
    hold_ref_id,
    created_at,
    updated_at
  ) values (
    p_reservation_id,
    p_workspace_id,
    p_amount_nanos,
    'reserved',
    nullif(trim(coalesce(p_hold_ref_id, '')), ''),
    now(),
    now()
  );

  v_before_balance := coalesce(v_wallet.balance_nanos, 0);
  v_before_reserved := coalesce(v_wallet.reserved_nanos, 0);

  update public.wallets
  set reserved_nanos = coalesce(reserved_nanos, 0) + p_amount_nanos,
      updated_at = now()
  where workspace_id = p_workspace_id
  returning *
  into v_wallet;

  return query select true, true, null::text, p_amount_nanos,
    v_before_balance,
    coalesce(v_wallet.balance_nanos, 0),
    v_before_reserved,
    coalesce(v_wallet.reserved_nanos, 0);
end;
$$;

create or replace function public.gateway_wallet_capture_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_capture_ref_id text default null
)
returns table (
  ok boolean,
  applied boolean,
  reason text,
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
      capture_ref_id = nullif(trim(coalesce(p_capture_ref_id, '')), ''),
      captured_at = now(),
      updated_at = now()
  where reservation_id = p_reservation_id
    and workspace_id = p_workspace_id;

  return query select true, true, null::text, v_amount,
    coalesce(v_wallet.balance_nanos, 0) + v_amount,
    coalesce(v_wallet.balance_nanos, 0),
    coalesce(v_wallet.reserved_nanos, 0) + v_amount,
    coalesce(v_wallet.reserved_nanos, 0);
end;
$$;

create or replace function public.gateway_wallet_release_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_release_ref_id text default null
)
returns table (
  ok boolean,
  applied boolean,
  reason text,
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
$$;
