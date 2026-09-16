-- Additive, service-only wrapper. Existing gateways retain their charging API.
create or replace function public.gateway_charge_with_credit_cache(
  p_workspace_id uuid,
  p_request_id text,
  p_cost_nanos bigint,
  p_credit_snapshot_balance_nanos bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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
    p_workspace_id, p_request_id, p_cost_nanos
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

  if (v_result ->> 'applied')::boolean is true
     and v_result ->> 'status' = 'top_up_not_required'
     and p_credit_snapshot_balance_nanos >= 10000000000 then
    select w.balance_nanos::numeric - coalesce(w.reserved_nanos, 0)::numeric
    into v_available from public.wallets w where w.workspace_id = p_workspace_id;

    -- Compare to the request's original snapshot, NOT just this request's cost.
    -- This catches cumulative spending by other requests and includes holds.
    -- Numeric arithmetic avoids bigint multiplication overflow at large balances.
    if v_available >= 10000000000
       and v_available * 10 > p_credit_snapshot_balance_nanos::numeric * 9 then
      v_invalidate := false;
    end if;
  end if;

  -- Replays invalidate conservatively: an earlier response/invalidation may
  -- have been lost after the debit committed. Never debit a replay twice.
  return v_result || jsonb_build_object('invalidate_credit_cache', v_invalidate);
end;
$$;

revoke all on function public.gateway_charge_with_credit_cache(uuid,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.gateway_charge_with_credit_cache(uuid,text,bigint,bigint) to service_role;
