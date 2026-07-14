-- Capture the actual batch cost from a larger pre-submit reservation atomically.

alter table public.gateway_wallet_reservations
  add column if not exists settled_amount_nanos bigint null;

create or replace function public.gateway_wallet_settle_once(
  p_workspace_id uuid,
  p_reservation_id text,
  p_actual_nanos bigint,
  p_settle_ref_id text default null
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
set search_path = public, pg_temp
as $$
declare
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_before_balance bigint;
  v_before_reserved bigint;
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
  if p_actual_nanos > v_reservation.amount_nanos then
    return query select false, false, 'reservation_exceeded'::text, p_actual_nanos,
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
      capture_ref_id = nullif(trim(coalesce(p_settle_ref_id, '')), ''),
      captured_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id and reservation_id = p_reservation_id;

  return query select true, true, null::text, p_actual_nanos,
    v_before_balance, coalesce(v_wallet.balance_nanos, 0),
    v_before_reserved, coalesce(v_wallet.reserved_nanos, 0);
end;
$$;

revoke all on function public.gateway_wallet_settle_once(uuid, text, bigint, text) from public;
grant execute on function public.gateway_wallet_settle_once(uuid, text, bigint, text) to service_role;
