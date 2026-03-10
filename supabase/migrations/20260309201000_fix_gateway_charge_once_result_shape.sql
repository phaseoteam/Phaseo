-- Fix gateway_deduct_and_check_top_up_once to tolerate legacy return shapes from deduct_and_check_top_up.

create or replace function public.gateway_deduct_and_check_top_up_once(
  p_team_id uuid,
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
  v_result record;
  v_result_json jsonb;
  v_status text;
  v_auto_top_up_amount_nanos bigint;
  v_auto_top_up_account_id text;
  v_stripe_customer_id text;
begin
  if p_team_id is null then
    raise exception 'missing_team_id';
  end if;

  if coalesce(trim(p_request_id), '') = '' then
    raise exception 'missing_request_id';
  end if;

  if p_cost_nanos is null or p_cost_nanos <= 0 then
    raise exception 'invalid_cost_nanos';
  end if;

  insert into public.gateway_request_charges (
    team_id,
    request_id,
    cost_nanos,
    status,
    created_at,
    updated_at
  ) values (
    p_team_id,
    p_request_id,
    p_cost_nanos,
    'applying',
    now(),
    now()
  )
  on conflict (team_id, request_id) do nothing;

  select *
  into v_charge
  from public.gateway_request_charges
  where team_id = p_team_id
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
  where team_id = p_team_id
    and request_id = p_request_id;

  begin
    select *
    into v_result
    from public.deduct_and_check_top_up(
      p_team_id := p_team_id,
      p_cost_nanos := p_cost_nanos
    );

    v_result_json := to_jsonb(v_result);
  exception when others then
    update public.gateway_request_charges
    set status = 'failed',
        error_message = sqlerrm,
        updated_at = now()
    where team_id = p_team_id
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
      updated_at = now()
  where team_id = p_team_id
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
$$;

revoke all on function public.gateway_deduct_and_check_top_up_once(uuid, text, bigint) from public;
grant execute on function public.gateway_deduct_and_check_top_up_once(uuid, text, bigint) to service_role;