-- Recompile charge + wallet deduction RPCs with workspace-era arguments/columns.
-- Some linked environments still had legacy team_id function definitions in schema cache.

drop function if exists public.gateway_deduct_and_check_top_up_once(uuid, text, bigint);
drop function if exists public.deduct_and_check_top_up(uuid, bigint);

create or replace function public.deduct_and_check_top_up(
  p_workspace_id uuid,
  p_cost_nanos bigint
)
returns json
language plpgsql
set search_path = public
as $$
declare
  v_new_balance bigint;
  v_low_threshold bigint;
  v_auto_top_up_amount bigint;
  v_auto_top_up_enabled boolean;
  v_auto_top_up_account_id text;
  v_stripe_customer_id text;
begin
  update wallets
  set balance_nanos = balance_nanos - p_cost_nanos
  where workspace_id = p_workspace_id
  returning balance_nanos,
            low_balance_threshold,
            auto_top_up_amount,
            auto_top_up_enabled,
            auto_top_up_account_id,
            stripe_customer_id
  into v_new_balance,
       v_low_threshold,
       v_auto_top_up_amount,
       v_auto_top_up_enabled,
       v_auto_top_up_account_id,
       v_stripe_customer_id;

  if v_new_balance is null then
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

  return json_build_object(
    'status', 'top_up_not_required',
    'new_balance_nanos', v_new_balance
  );
end;
$$;

create or replace function public.gateway_deduct_and_check_top_up_once(
  p_workspace_id uuid,
  p_request_id text,
  p_cost_nanos bigint
)
returns table(
  applied boolean,
  already_applied boolean,
  status text,
  auto_top_up_amount_nanos bigint,
  auto_top_up_account_id text,
  stripe_customer_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.gateway_request_charges%rowtype;
  v_result_json jsonb;
  v_status text;
  v_auto_top_up_amount_nanos bigint;
  v_auto_top_up_account_id text;
  v_stripe_customer_id text;
  v_applied boolean;
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

  insert into public.gateway_request_charges (
    workspace_id,
    request_id,
    cost_nanos,
    status,
    created_at,
    updated_at
  ) values (
    p_workspace_id,
    p_request_id,
    p_cost_nanos,
    'applying',
    now(),
    now()
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
    select public.deduct_and_check_top_up(
      p_workspace_id := p_workspace_id,
      p_cost_nanos := p_cost_nanos
    )::jsonb
    into v_result_json;
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
  v_applied := v_status in ('top_up_required', 'top_up_not_required');

  update public.gateway_request_charges
  set status = case when v_applied then 'applied' else 'failed' end,
      deducted_status = v_status,
      auto_top_up_required = v_status = 'top_up_required',
      error_message = case when v_applied then null else format('deduct_and_check_top_up returned %s', v_status) end,
      updated_at = now()
  where workspace_id = p_workspace_id
    and request_id = p_request_id;

  return query
  select
    v_applied,
    false,
    v_status,
    v_auto_top_up_amount_nanos,
    v_auto_top_up_account_id,
    v_stripe_customer_id;
end;
$$;

revoke all on function public.deduct_and_check_top_up(uuid, bigint) from public;
grant execute on function public.deduct_and_check_top_up(uuid, bigint) to service_role;

revoke all on function public.gateway_deduct_and_check_top_up_once(uuid, text, bigint) from public;
grant execute on function public.gateway_deduct_and_check_top_up_once(uuid, text, bigint) to service_role;
