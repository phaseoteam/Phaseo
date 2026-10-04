CREATE OR REPLACE FUNCTION public.deduct_and_check_top_up (
  p_workspace_id uuid,
  p_cost_nanos   bigint
)
  RETURNS json
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_new_balance bigint;
  v_low_threshold bigint;
  v_auto_top_up_amount bigint;
  v_auto_top_up_enabled boolean;
  v_auto_top_up_account_id text;
  v_stripe_customer_id text;
begin
  if p_cost_nanos is null or p_cost_nanos <= 0 then
    raise exception 'invalid_cost_nanos';
  end if;
  update public.wallets
  set balance_nanos = balance_nanos - p_cost_nanos
  where workspace_id = p_workspace_id
    and balance_nanos - p_cost_nanos >= coalesce(reserved_nanos, 0)
  returning balance_nanos, low_balance_threshold, auto_top_up_amount,
    auto_top_up_enabled, auto_top_up_account_id, stripe_customer_id
  into v_new_balance, v_low_threshold, v_auto_top_up_amount,
    v_auto_top_up_enabled, v_auto_top_up_account_id, v_stripe_customer_id;

  if v_new_balance is null then
    if exists (select 1 from public.wallets where workspace_id = p_workspace_id) then
      raise exception 'insufficient_unreserved_balance';
    end if;
    return json_build_object('status', 'wallet_not_found');
  end if;
  if v_auto_top_up_enabled and v_new_balance < v_low_threshold then
    return json_build_object(
      'status', 'top_up_required',
      'auto_top_up_amount_nanos', v_auto_top_up_amount,
      'auto_top_up_account_id', v_auto_top_up_account_id,
      'stripe_customer_id', v_stripe_customer_id,
      'new_balance_nanos', v_new_balance
    );
  end if;
  return json_build_object('status', 'top_up_not_required', 'new_balance_nanos', v_new_balance);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."deduct_and_check_top_up"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";
