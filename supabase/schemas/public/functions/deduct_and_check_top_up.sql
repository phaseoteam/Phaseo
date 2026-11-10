CREATE OR REPLACE FUNCTION public.deduct_and_check_top_up (
  p_workspace_id uuid,
  p_cost_nanos   bigint
)
  RETURNS json
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_new_balance bigint;
  v_overdraft_nanos bigint;
  v_low boolean;
  v_trigger_top_up boolean;
begin
  if p_cost_nanos is null or p_cost_nanos <= 0 then
    raise exception 'invalid_cost_nanos';
  end if;

  select * into v_wallet
  from public.wallets
  where workspace_id = p_workspace_id
  for update;

  if not found then
    return json_build_object('status', 'wallet_not_found');
  end if;

  -- The request has already been served, so its real cost is always charged.
  -- When it is more than the unreserved balance the wallet goes into overdraft
  -- (balance below reserved, or below zero); admission then blocks the
  -- workspace until it is topped up. overdraft_nanos is the part of this cost
  -- that the unreserved balance did not cover.
  v_new_balance := v_wallet.balance_nanos - p_cost_nanos;
  v_overdraft_nanos := greatest(0, p_cost_nanos - greatest(0, v_wallet.balance_nanos - coalesce(v_wallet.reserved_nanos, 0)));

  -- One auto top-up at a time: the marker is set under this row lock and
  -- cleared when the top-up is credited, or expires after 15 minutes.
  v_low := v_wallet.auto_top_up_enabled and v_new_balance < v_wallet.low_balance_threshold;
  v_trigger_top_up := v_low and (
    v_wallet.auto_top_up_in_flight_until is null or v_wallet.auto_top_up_in_flight_until <= now()
  );

  update public.wallets
  set balance_nanos = v_new_balance,
      auto_top_up_in_flight_until = case
        when v_trigger_top_up then now() + interval '15 minutes'
        else auto_top_up_in_flight_until
      end
  where workspace_id = p_workspace_id;

  if v_trigger_top_up then
    return json_build_object(
      'status', 'top_up_required',
      'auto_top_up_amount_nanos', v_wallet.auto_top_up_amount,
      'auto_top_up_account_id', v_wallet.auto_top_up_account_id,
      'stripe_customer_id', v_wallet.stripe_customer_id,
      'new_balance_nanos', v_new_balance,
      'overdraft_nanos', v_overdraft_nanos
    );
  end if;
  if v_low then
    return json_build_object('status', 'top_up_pending', 'new_balance_nanos', v_new_balance, 'overdraft_nanos', v_overdraft_nanos);
  end if;
  return json_build_object('status', 'top_up_not_required', 'new_balance_nanos', v_new_balance, 'overdraft_nanos', v_overdraft_nanos);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";
