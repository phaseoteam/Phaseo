-- Gateway request charge idempotency
-- Ensures wallet debit/top-up side effects are applied once per (team_id, request_id).

create table if not exists public.gateway_request_charges (
  team_id uuid not null references public.teams(id) on delete cascade,
  request_id text not null,
  cost_nanos bigint not null check (cost_nanos > 0),
  status text not null default 'applying' check (status in ('applying', 'applied', 'failed')),
  deducted_status text null,
  auto_top_up_required boolean not null default false,
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gateway_request_charges_pkey primary key (team_id, request_id)
);

create index if not exists idx_gateway_request_charges_created_at
  on public.gateway_request_charges (created_at desc);

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
  exception when others then
    update public.gateway_request_charges
    set status = 'failed',
        error_message = sqlerrm,
        updated_at = now()
    where team_id = p_team_id
      and request_id = p_request_id;
    raise;
  end;

  update public.gateway_request_charges
  set status = 'applied',
      deducted_status = coalesce(v_result.status, 'unknown'),
      auto_top_up_required = coalesce(v_result.status, '') = 'top_up_required',
      updated_at = now()
  where team_id = p_team_id
    and request_id = p_request_id;

  return query
  select
    true,
    false,
    coalesce(v_result.status, 'unknown')::text,
    coalesce(v_result.auto_top_up_amount_nanos, 0)::bigint,
    case when v_result.auto_top_up_account_id is null then null else v_result.auto_top_up_account_id::text end,
    case when v_result.stripe_customer_id is null then null else v_result.stripe_customer_id::text end;
end;
$$;

revoke all on function public.gateway_deduct_and_check_top_up_once(uuid, text, bigint) from public;
grant execute on function public.gateway_deduct_and_check_top_up_once(uuid, text, bigint) to service_role;
