CREATE OR REPLACE FUNCTION public.gateway_wallet_capture_once (
  p_workspace_id   uuid,
  p_reservation_id text,
  p_capture_ref_id text DEFAULT NULL::text
)
  RETURNS TABLE (
    ok                    boolean,
    applied               boolean,
    reason                text,
    amount_nanos          bigint,
    before_balance_nanos  bigint,
    after_balance_nanos   bigint,
    before_reserved_nanos bigint,
    after_reserved_nanos  bigint
  )
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
    return query select true, false, 'already_captured'::text, coalesce(v_existing.settled_amount_nanos, v_existing.amount_nanos),
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.balance_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint,
      coalesce(v_wallet.reserved_nanos, 0)::bigint;
    return;
  end if;

  if v_existing.status not in ('held', 'reserved') then
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

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_capture_once"(uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_capture_once"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_capture_once"(uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_capture_once"(uuid, text, text) FROM PUBLIC, "anon", "authenticated";
