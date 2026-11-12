SET LOCAL lock_timeout = '10s';

-- One charged total per request for streams charged in steps.
-- A stream whose client left is charged at checkpoints while its upstream
-- drains, then from its final bill. gateway_charge_request_total keeps the
-- total charged so far on the request's gateway_request_charges row and
-- charges, or on the final call refunds, the difference, so a call whose
-- response was lost is reconciled by the next one and an estimate above the
-- final bill (or a waived bill) is given back. Every adjustment writes a
-- credit_ledger 'adjustment' row (ref_type gateway_request_charge), which
-- spend totals do not add to the charge row.

-- Functions only: the gateway_request_charges columns are added by the previous migration,
-- 20261110140722_gateway_request_charges_stepped_columns.

-- One-off charges record their key too: both functions gain p_key_id. The old
-- signatures are dropped first, so a call without p_key_id is not ambiguous.
drop function if exists public.gateway_charge_with_credit_cache(uuid, text, bigint, bigint);
drop function if exists public.gateway_deduct_and_check_top_up_once(uuid, text, bigint);

CREATE OR REPLACE FUNCTION public.gateway_deduct_and_check_top_up_once (
  p_workspace_id uuid,
  p_request_id   text,
  p_cost_nanos   bigint,
  p_key_id       uuid   DEFAULT NULL::uuid
)
  RETURNS TABLE (
    applied                  boolean,
    already_applied          boolean,
    status                   text,
    auto_top_up_amount_nanos bigint,
    auto_top_up_account_id   text,
    stripe_customer_id       text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_charge public.gateway_request_charges%rowtype;
  v_result record;
  v_result_json jsonb;
  v_status text;
  v_auto_top_up_amount_nanos bigint;
  v_auto_top_up_account_id text;
  v_stripe_customer_id text;
begin
  if p_workspace_id is null then
    raise exception 'missing_workspace_id';
  end if;

  if coalesce(trim(p_request_id), '') = '' then
    raise exception 'missing_request_id';
  end if;

  if p_cost_nanos is null or p_cost_nanos <= 0 then
    raise exception 'invalid_cost_nanos';
  end if;

  -- key_id attributes the charge to its key (and department) even when its
  -- request row never lands.
  insert into public.gateway_request_charges (
    workspace_id,
    request_id,
    cost_nanos,
    status,
    created_at,
    updated_at,
    key_id
  ) values (
    p_workspace_id,
    p_request_id,
    p_cost_nanos,
    'applying',
    now(),
    now(),
    p_key_id
  )
  on conflict (workspace_id, request_id) do nothing;

  select *
  into v_charge
  from public.gateway_request_charges
  where workspace_id = p_workspace_id
    and request_id = p_request_id
  for update;

  if not found then
    raise exception 'gateway_request_charge_row_missing';
  end if;

  if v_charge.cost_nanos <> p_cost_nanos then
    raise exception 'request_charge_amount_mismatch';
  end if;

  if v_charge.status = 'applied' then
    return query
    select
      false,
      true,
      coalesce(v_charge.deducted_status, 'already_applied')::text,
      0::bigint,
      null::text,
      null::text;
    return;
  end if;

  update public.gateway_request_charges
  set status = 'applying',
      error_message = null,
      updated_at = now()
  where workspace_id = p_workspace_id
    and request_id = p_request_id;

  begin
    select *
    into v_result
    from public.deduct_and_check_top_up(
      p_workspace_id := p_workspace_id,
      p_cost_nanos := p_cost_nanos
    );

    v_result_json := to_jsonb(v_result);
  exception when others then
    update public.gateway_request_charges
    set status = 'failed',
        error_message = sqlerrm,
        updated_at = now()
    where workspace_id = p_workspace_id
      and request_id = p_request_id;
    raise;
  end;

  v_status := coalesce(
    nullif(trim(v_result_json ->> 'status'), ''),
    nullif(trim(v_result_json ->> 'result'), ''),
    nullif(trim(v_result_json ->> 'deduct_and_check_top_up'), ''),
    'unknown'
  );

  v_auto_top_up_amount_nanos := case
    when coalesce(v_result_json ->> 'auto_top_up_amount_nanos', '') ~ '^-?[0-9]+$'
      then (v_result_json ->> 'auto_top_up_amount_nanos')::bigint
    when coalesce(v_result_json ->> 'auto_top_up_amount', '') ~ '^-?[0-9]+$'
      then (v_result_json ->> 'auto_top_up_amount')::bigint
    else 0::bigint
  end;

  v_auto_top_up_account_id := nullif(
    coalesce(
      v_result_json ->> 'auto_top_up_account_id',
      v_result_json ->> 'auto_top_up_payment_method_id',
      ''
    ),
    ''
  );

  v_stripe_customer_id := nullif(v_result_json ->> 'stripe_customer_id', '');

  update public.gateway_request_charges
  set status = 'applied',
      deducted_status = v_status,
      auto_top_up_required = v_status = 'top_up_required',
      -- deduct_and_check_top_up returns json, so the record nests it under the function name.
      overdraft_nanos = case
        when coalesce(coalesce(v_result_json -> 'deduct_and_check_top_up', v_result_json) ->> 'overdraft_nanos', '') ~ '^[0-9]+$'
          then (coalesce(v_result_json -> 'deduct_and_check_top_up', v_result_json) ->> 'overdraft_nanos')::bigint
        else 0::bigint
      end,
      updated_at = now()
  where workspace_id = p_workspace_id
    and request_id = p_request_id;

  return query
  select
    true,
    false,
    v_status,
    v_auto_top_up_amount_nanos,
    v_auto_top_up_account_id,
    v_stripe_customer_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_deduct_and_check_top_up_once"(uuid, text, bigint, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_deduct_and_check_top_up_once"(uuid, text, bigint, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_deduct_and_check_top_up_once"(uuid, text, bigint, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_deduct_and_check_top_up_once"(uuid, text, bigint, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_charge_with_credit_cache (
  p_workspace_id                  uuid,
  p_request_id                    text,
  p_cost_nanos                    bigint,
  p_credit_snapshot_balance_nanos bigint DEFAULT NULL::bigint,
  p_key_id                        uuid   DEFAULT NULL::uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  v_result jsonb;
  v_legacy jsonb;
  v_available numeric;
  v_invalidate boolean := true;
begin
  -- Keep the existing idempotency key, debit, wallet lock and top-up behavior.
  -- A successful debit holds its wallet row lock until this transaction ends.
  select to_jsonb(charged) into v_result
  from public.gateway_deduct_and_check_top_up_once(
    p_workspace_id, p_request_id, p_cost_nanos, p_key_id
  ) as charged;

  if v_result is null then raise exception 'gateway_charge_result_missing'; end if;

  -- Some deployed debit functions return JSON through a scalar result column.
  -- The older idempotency wrapper stores that JSON as the status string.
  -- Normalize the known fields here without replacing either existing function.
  begin
    v_legacy := (v_result ->> 'status')::jsonb;
    if jsonb_typeof(v_legacy) = 'object' and jsonb_typeof(v_legacy -> 'status') = 'string' then
      v_result := v_result || jsonb_build_object(
        'status', v_legacy -> 'status',
        'auto_top_up_amount_nanos', coalesce(v_legacy -> 'auto_top_up_amount_nanos', v_result -> 'auto_top_up_amount_nanos'),
        'auto_top_up_account_id', coalesce(v_legacy -> 'auto_top_up_account_id', v_result -> 'auto_top_up_account_id'),
        'stripe_customer_id', coalesce(v_legacy -> 'stripe_customer_id', v_result -> 'stripe_customer_id')
      );
    end if;
  exception when invalid_text_representation then
    null; -- Ordinary textual status; no legacy conversion is needed.
  end;

  if (v_result ->> 'applied')::boolean is true then
    -- Read under the debit's wallet row lock: this is the exact post-charge
    -- available balance, which the gateway can write back to its cache instead
    -- of deleting the entry and re-reading the wallet on the next request.
    select w.balance_nanos::numeric - coalesce(w.reserved_nanos, 0)::numeric
    into v_available from public.wallets w where w.workspace_id = p_workspace_id;

    -- Compare to the request's original snapshot, NOT just this request's cost.
    -- This catches cumulative spending by other requests and includes holds.
    -- Numeric arithmetic avoids bigint multiplication overflow at large balances.
    if v_result ->> 'status' = 'top_up_not_required'
       and p_credit_snapshot_balance_nanos >= 10000000000
       and v_available >= 10000000000
       and v_available * 10 > p_credit_snapshot_balance_nanos::numeric * 9 then
      v_invalidate := false;
    end if;
  end if;

  -- Replays invalidate conservatively: an earlier response/invalidation may
  -- have been lost after the debit committed. Never debit a replay twice.
  return v_result || jsonb_build_object(
    'invalidate_credit_cache', v_invalidate,
    'available_nanos', case when v_available is null then null else greatest(v_available, 0)::bigint end
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_charge_with_credit_cache"(uuid, text, bigint, bigint, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_charge_with_credit_cache"(uuid, text, bigint, bigint, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_charge_with_credit_cache"(uuid, text, bigint, bigint, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_charge_with_credit_cache"(uuid, text, bigint, bigint, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_charge_request_total (
  p_workspace_id                  uuid,
  p_request_id                    text,
  p_total_nanos                   bigint,
  p_final                         boolean,
  p_credit_snapshot_balance_nanos bigint DEFAULT NULL::bigint,
  p_key_id                        uuid   DEFAULT NULL::uuid
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
  -- key_id lets budgets attribute a charge to its key before the request's
  -- gateway_requests row exists (a drain the runtime stopped never gets one).
  insert into public.gateway_request_charges (workspace_id, request_id, cost_nanos, status, is_final, key_id)
  values (p_workspace_id, p_request_id, 0, 'applying', false, p_key_id)
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
      key_id = coalesce(key_id, p_key_id),
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

GRANT EXECUTE ON FUNCTION "public"."gateway_charge_request_total"(uuid, text, bigint, boolean, bigint, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_charge_request_total"(uuid, text, bigint, boolean, bigint, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_charge_request_total"(uuid, text, bigint, boolean, bigint, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_charge_request_total"(uuid, text, bigint, boolean, bigint, uuid) FROM PUBLIC, "anon", "authenticated";
