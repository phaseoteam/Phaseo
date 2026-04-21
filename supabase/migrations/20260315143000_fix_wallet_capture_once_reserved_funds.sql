-- Capture should consume reserved funds directly.
-- Requiring raw balance >= reservation amount can stall legitimate captures
-- after unrelated debits, despite funds being held in reserved_nanos.

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

  insert into public.credit_ledger (
    workspace_id,
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
    p_workspace_id,
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

revoke all on function public.gateway_wallet_capture_once(uuid, text, text) from public;
grant execute on function public.gateway_wallet_capture_once(uuid, text, text) to service_role;
