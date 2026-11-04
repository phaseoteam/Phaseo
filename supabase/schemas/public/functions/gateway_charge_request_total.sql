CREATE OR REPLACE FUNCTION public.gateway_charge_request_total (
  p_workspace_id                  uuid,
  p_request_id                    text,
  p_total_nanos                   bigint,
  p_final                         boolean,
  p_credit_snapshot_balance_nanos bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_charge public.gateway_request_charges%rowtype;
  v_wallet public.wallets%rowtype;
  v_charged bigint;
  v_total bigint := p_total_nanos;
  v_delta bigint;
  v_deduct jsonb := '{}'::jsonb;
  v_status text;
  v_overdraft bigint;
  v_before_balance bigint;
  v_after_balance bigint;
  v_available numeric;
  v_invalidate boolean := true;
begin
  -- A request whose total is charged in steps: while its stream drains after
  -- the client left, then once from the final bill. The charge row holds the
  -- total charged so far; each call charges or (finally) refunds the
  -- difference, so a call whose response was lost is reconciled by the next.
  if p_workspace_id is null then raise exception 'missing_workspace_id'; end if;
  if coalesce(trim(p_request_id), '') = '' then raise exception 'missing_request_id'; end if;
  if p_total_nanos is null or p_total_nanos < 0 then raise exception 'invalid_cost_nanos'; end if;
  if p_final is null then raise exception 'invalid_final_flag'; end if;
  if not p_final and p_total_nanos = 0 then
    return jsonb_build_object('applied', false, 'already_applied', true, 'status', 'nothing_to_charge',
      'charged_total_nanos', null, 'delta_nanos', 0, 'invalidate_credit_cache', false, 'available_nanos', null);
  end if;

  -- Same lock order as gateway_deduct_and_check_top_up_once: this request's
  -- charge row, then the wallet row.
  insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final)
  values (p_workspace_id, p_request_id, 0, 'applying', false)
  on conflict (workspace_id, request_id) do nothing;

  select * into v_charge from public.gateway_request_charges
  where workspace_id = p_workspace_id and request_id = p_request_id
  for update;
  if not found then raise exception 'gateway_request_charge_row_missing'; end if;

  -- Settled: a one-off charge, or a final total. Replays and late checkpoints
  -- change nothing; a different final total is refused.
  if v_charge.is_final then
    if p_final and (v_charge.status <> 'applied' or v_charge.cost_nanos <> p_total_nanos) then
      raise exception 'request_charge_amount_mismatch';
    end if;
    return jsonb_build_object('applied', false, 'already_applied', true,
      'status', coalesce(v_charge.deducted_status, 'already_applied'),
      'charged_total_nanos', v_charge.cost_nanos, 'delta_nanos', 0,
      'invalidate_credit_cache', true, 'available_nanos', null);
  end if;

  v_charged := case when v_charge.status = 'applied' then v_charge.cost_nanos else 0 end;
  -- A checkpoint is an estimate: it never refunds.
  if not p_final then v_total := greatest(v_total, v_charged); end if;
  v_delta := v_total - v_charged;
  v_overdraft := coalesce(v_charge.overdraft_nanos, 0);

  if v_delta = 0 and not p_final then
    return jsonb_build_object('applied', false, 'already_applied', true,
      'status', coalesce(v_charge.deducted_status, 'already_applied'),
      'charged_total_nanos', v_charged, 'delta_nanos', 0,
      'invalidate_credit_cache', true, 'available_nanos', null);
  end if;

  if v_delta > 0 then
    -- The real cost is always charged, into overdraft when needed, with the
    -- usual auto top-up decision (deduct_and_check_top_up locks the wallet).
    v_deduct := to_jsonb(public.deduct_and_check_top_up(p_workspace_id, v_delta));
    v_status := coalesce(v_deduct ->> 'status', 'unknown');
    if v_status = 'wallet_not_found' then raise exception 'wallet_not_found'; end if;
    v_after_balance := (v_deduct ->> 'new_balance_nanos')::bigint;
    v_before_balance := v_after_balance + v_delta;
    v_overdraft := v_overdraft + coalesce((v_deduct ->> 'overdraft_nanos')::bigint, 0);
    select * into v_wallet from public.wallets where workspace_id = p_workspace_id;
  else
    select * into v_wallet from public.wallets where workspace_id = p_workspace_id for update;
    if not found then raise exception 'wallet_not_found'; end if;
    v_before_balance := v_wallet.balance_nanos;
    v_after_balance := v_wallet.balance_nanos - v_delta;
    if v_delta < 0 then
      -- The final bill is below what the estimates charged: give back the rest.
      update public.wallets set balance_nanos = v_after_balance where workspace_id = p_workspace_id
      returning * into v_wallet;
      v_overdraft := greatest(0, v_overdraft + v_delta);
      v_status := 'credited';
    else
      v_status := coalesce(v_charge.deducted_status, 'top_up_not_required');
    end if;
  end if;

  if v_delta <> 0 then
    insert into public.credit_ledger (
      workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
      before_reserved_nanos, after_reserved_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status
    ) values (
      p_workspace_id, 'adjustment', -v_delta, v_before_balance, v_after_balance,
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0),
      'gateway_request_charge',
      p_workspace_id::text || ':' || p_request_id || ':' || case when p_final then 'final' else v_total::text end,
      'gateway_request', p_request_id, 'applied'
    );
  end if;

  update public.gateway_request_charges
  set cost_nanos = v_total,
      status = 'applied',
      deducted_status = v_status,
      auto_top_up_required = v_status = 'top_up_required',
      overdraft_nanos = v_overdraft,
      is_final = p_final,
      error_message = null,
      updated_at = now()
  where workspace_id = p_workspace_id and request_id = p_request_id;

  v_available := coalesce(v_wallet.balance_nanos, 0)::numeric - coalesce(v_wallet.reserved_nanos, 0)::numeric;
  -- Same cache decision as gateway_charge_with_credit_cache.
  if v_status = 'top_up_not_required'
     and p_credit_snapshot_balance_nanos >= 10000000000
     and v_available >= 10000000000
     and v_available * 10 > p_credit_snapshot_balance_nanos::numeric * 9 then
    v_invalidate := false;
  end if;

  return jsonb_build_object(
    'applied', true,
    'already_applied', false,
    'status', v_status,
    'charged_total_nanos', v_total,
    'delta_nanos', v_delta,
    'overdraft_nanos', v_overdraft,
    'auto_top_up_amount_nanos', coalesce((v_deduct ->> 'auto_top_up_amount_nanos')::bigint, 0),
    'auto_top_up_account_id', v_deduct ->> 'auto_top_up_account_id',
    'stripe_customer_id', v_deduct ->> 'stripe_customer_id',
    'invalidate_credit_cache', v_invalidate,
    'available_nanos', greatest(v_available, 0)::bigint
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_charge_request_total"(uuid, text, bigint, boolean, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_charge_request_total"(uuid, text, bigint, boolean, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_charge_request_total"(uuid, text, bigint, boolean, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_charge_request_total"(uuid, text, bigint, boolean, bigint) FROM PUBLIC, "anon", "authenticated";
