-- =========================
-- Wallet reservations for async video billing (hold -> capture/release)
-- =========================

alter table public.wallets
  add column if not exists reserved_nanos bigint not null default 0;
alter table public.credit_ledger
  add column if not exists before_reserved_nanos bigint null,
  add column if not exists after_reserved_nanos bigint null;
create table if not exists public.gateway_wallet_reservations (
  team_id uuid not null references public.teams(id) on delete cascade,
  reservation_id text not null,
  amount_nanos bigint not null check (amount_nanos > 0),
  status text not null check (status in ('held', 'captured', 'released')),
  hold_ref_id text null,
  capture_ref_id text null,
  release_ref_id text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gateway_wallet_reservations_pkey primary key (team_id, reservation_id)
);
create index if not exists idx_gateway_wallet_reservations_status_updated
  on public.gateway_wallet_reservations (status, updated_at desc);
alter table public.gateway_wallet_reservations enable row level security;
drop policy if exists gateway_wallet_reservations_select_own_team on public.gateway_wallet_reservations;
create policy gateway_wallet_reservations_select_own_team
  on public.gateway_wallet_reservations
  for select
  to authenticated
  using (public.is_team_member(team_id));
drop policy if exists gateway_wallet_reservations_service_all on public.gateway_wallet_reservations;
create policy gateway_wallet_reservations_service_all
  on public.gateway_wallet_reservations
  for all
  to service_role
  using (true)
  with check (true);
grant select on public.gateway_wallet_reservations to authenticated;
grant select, insert, update on public.gateway_wallet_reservations to service_role;
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

  update public.wallets
  set reserved_nanos = reserved_nanos + p_amount_nanos,
      updated_at = now()
  where team_id = p_team_id
  returning *
  into v_wallet;

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
  );

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
    v_wallet.balance_nanos,
    v_wallet.balance_nanos,
    v_wallet.reserved_nanos - p_amount_nanos,
    v_wallet.reserved_nanos,
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
    v_wallet.balance_nanos,
    v_wallet.balance_nanos,
    v_wallet.reserved_nanos - p_amount_nanos,
    v_wallet.reserved_nanos;
end;
$$;
create or replace function public.gateway_wallet_capture_once(
  p_team_id uuid,
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
  if p_team_id is null then
    raise exception 'missing_team_id';
  end if;
  if coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'missing_reservation_id';
  end if;

  select *
  into v_reservation
  from public.gateway_wallet_reservations
  where team_id = p_team_id
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
  where team_id = p_team_id
  for update;

  if not found then
    raise exception 'wallet_not_found';
  end if;

  if coalesce(v_wallet.reserved_nanos, 0) < v_amount then
    return query
    select false, false, 'reserved_balance_mismatch'::text, v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos, v_wallet.reserved_nanos, v_wallet.reserved_nanos;
    return;
  end if;

  if coalesce(v_wallet.balance_nanos, 0) < v_amount then
    return query
    select false, false, 'insufficient_balance'::text, v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos, v_wallet.reserved_nanos, v_wallet.reserved_nanos;
    return;
  end if;

  update public.wallets
  set balance_nanos = balance_nanos - v_amount,
      reserved_nanos = reserved_nanos - v_amount,
      updated_at = now()
  where team_id = p_team_id
  returning *
  into v_wallet;

  update public.gateway_wallet_reservations
  set status = 'captured',
      capture_ref_id = nullif(trim(coalesce(p_capture_ref_id, '')), ''),
      updated_at = now()
  where team_id = p_team_id
    and reservation_id = p_reservation_id;

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
    'capture',
    -v_amount,
    v_wallet.balance_nanos + v_amount,
    v_wallet.balance_nanos,
    v_wallet.reserved_nanos + v_amount,
    v_wallet.reserved_nanos,
    'wallet_reservation_capture',
    p_reservation_id,
    now(),
    'captured'
  ) on conflict (ref_type, ref_id) do nothing;

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
  p_team_id uuid,
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
  if p_team_id is null then
    raise exception 'missing_team_id';
  end if;
  if coalesce(trim(p_reservation_id), '') = '' then
    raise exception 'missing_reservation_id';
  end if;

  select *
  into v_reservation
  from public.gateway_wallet_reservations
  where team_id = p_team_id
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
  where team_id = p_team_id
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
  where team_id = p_team_id
  returning *
  into v_wallet;

  update public.gateway_wallet_reservations
  set status = 'released',
      release_ref_id = nullif(trim(coalesce(p_release_ref_id, '')), ''),
      updated_at = now()
  where team_id = p_team_id
    and reservation_id = p_reservation_id;

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
    'release',
    0,
    v_wallet.balance_nanos,
    v_wallet.balance_nanos,
    v_wallet.reserved_nanos + v_amount,
    v_wallet.reserved_nanos,
    'wallet_reservation_release',
    p_reservation_id,
    now(),
    'released'
  ) on conflict (ref_type, ref_id) do nothing;

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
