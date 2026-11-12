-- Minimal tables and the function definitions from origin/main on 2026-11-03
-- (before the billing security fixes); local tests only. Foreign keys to
-- tables the test doesn't need are left out.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;

create table public.workspaces (id uuid primary key, billing_mode text not null default 'wallet');
create table public.workspace_members (workspace_id uuid, user_id uuid, primary key (workspace_id, user_id));
create function public.is_workspace_member(p_team_id uuid) returns boolean language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.workspace_members m where m.workspace_id = p_team_id and m.user_id = auth.uid()) $$;
grant execute on function public.is_workspace_member(uuid) to authenticated;

create table public.wallets (
  workspace_id uuid primary key references public.workspaces(id),
  stripe_customer_id text not null default 'cus_test',
  balance_nanos bigint not null default 0,
  auto_top_up_enabled boolean not null default false,
  low_balance_threshold bigint not null default 0,
  auto_top_up_amount bigint not null default 0,
  updated_at timestamptz not null default now(),
  auto_top_up_account_id text,
  reserved_nanos bigint not null default 0
);
alter table public.wallets enable row level security;
create policy "wallets: update settings if owner" on public.wallets for update to authenticated
  using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy wallets_select_own_team on public.wallets for select to authenticated using (public.is_workspace_member(workspace_id));
grant select on public.wallets to authenticated;
grant update (auto_top_up_amount, auto_top_up_enabled, low_balance_threshold, updated_at) on public.wallets to authenticated;
grant select, insert, update on public.wallets to service_role;

create table public.gateway_request_charges (
  workspace_id uuid not null, request_id text not null, cost_nanos bigint not null check (cost_nanos > 0),
  status text not null default 'applying', deducted_status text, auto_top_up_required boolean not null default false,
  error_message text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);
grant select, insert, update on public.gateway_request_charges to service_role;

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  event_time timestamptz not null default now(), kind text not null, amount_nanos bigint not null,
  before_balance_nanos bigint not null, after_balance_nanos bigint not null,
  ref_type text not null, ref_id text not null, created_at timestamptz not null default now(),
  status text, source_ref_type text, source_ref_id text, refund_claim_state text, refund_claim_reason text,
  refund_claimed_at timestamptz, refund_claimed_by_user_id uuid, before_reserved_nanos bigint, after_reserved_nanos bigint
);
create unique index credit_ledger_ref_type_ref_id_key on public.credit_ledger (ref_type, ref_id);
grant select, insert, update on public.credit_ledger to service_role;

create table public.gateway_requests (
  created_at timestamptz not null default now(), workspace_id uuid not null,
  success boolean not null default false, cost_nanos bigint
);
grant select on public.gateway_requests to service_role;

create table public.gateway_wallet_reservations (
  workspace_id uuid not null, reservation_id text not null, amount_nanos bigint not null check (amount_nanos > 0),
  status text not null, hold_ref_id text, capture_ref_id text, release_ref_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  settled_amount_nanos bigint, captured_nanos bigint not null default 0, released_nanos bigint not null default 0,
  captured_at timestamptz, released_at timestamptz, key_id uuid, request_count integer, key_usage_recorded_at timestamptz,
  primary key (workspace_id, reservation_id)
);
grant select, insert, update on public.gateway_wallet_reservations to service_role;

create table public.credit_grants (
  id uuid primary key default gen_random_uuid(), code text not null, code_normalized text not null,
  amount_nanos bigint not null check (amount_nanos > 0), max_redemptions integer not null,
  redemptions_count integer not null default 0, expires_at timestamptz, is_active boolean not null default true
);
create table public.credit_grant_redemptions (
  id uuid primary key default gen_random_uuid(), grant_id uuid not null references public.credit_grants(id),
  user_id uuid not null, workspace_id uuid not null references public.workspaces(id),
  amount_nanos bigint not null check (amount_nanos > 0), created_at timestamptz not null default now(),
  constraint credit_grant_redemptions_grant_user_unique unique (grant_id, user_id)
);

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

CREATE OR REPLACE FUNCTION public.gateway_deduct_and_check_top_up_once (
  p_workspace_id uuid,
  p_request_id   text,
  p_cost_nanos   bigint
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

GRANT EXECUTE ON FUNCTION "public"."gateway_deduct_and_check_top_up_once"(uuid, text, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_deduct_and_check_top_up_once"(uuid, text, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_deduct_and_check_top_up_once"(uuid, text, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_deduct_and_check_top_up_once"(uuid, text, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_wallet_settle_once (
  p_workspace_id   uuid,
  p_reservation_id text,
  p_actual_nanos   bigint,
  p_settle_ref_id  text   DEFAULT NULL::text
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
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_wallet public.wallets%rowtype;
  v_reservation public.gateway_wallet_reservations%rowtype;
  v_before_balance bigint;
  v_before_reserved bigint;
  v_available_for_settlement bigint;
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
    if p_reservation_id not like 'video_hold:%' and coalesce(v_reservation.settled_amount_nanos, v_reservation.amount_nanos) <> p_actual_nanos then
      raise exception 'reservation_settlement_amount_mismatch';
    end if;
    return query select true, false, 'already_captured'::text, coalesce(v_reservation.settled_amount_nanos, v_reservation.amount_nanos),
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
  if coalesce(v_wallet.reserved_nanos, 0) < v_reservation.amount_nanos then
    return query select false, false, 'reserved_balance_mismatch'::text, p_actual_nanos,
      coalesce(v_wallet.balance_nanos, 0), coalesce(v_wallet.balance_nanos, 0),
      coalesce(v_wallet.reserved_nanos, 0), coalesce(v_wallet.reserved_nanos, 0);
    return;
  end if;

  -- The reservation itself is available to this settlement; all other holds
  -- remain excluded from spendable balance.
  v_available_for_settlement := coalesce(v_wallet.balance_nanos, 0)
    - coalesce(v_wallet.reserved_nanos, 0)
    + v_reservation.amount_nanos;
  if p_actual_nanos > v_available_for_settlement then
    return query select false, false, 'insufficient_balance'::text, p_actual_nanos,
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
      captured_nanos = least(p_actual_nanos, v_reservation.amount_nanos),
      released_nanos = greatest(0, v_reservation.amount_nanos - p_actual_nanos),
      capture_ref_id = nullif(trim(coalesce(p_settle_ref_id, '')), ''),
      captured_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id and reservation_id = p_reservation_id;

  if p_actual_nanos > 0 then
    insert into public.credit_ledger (
      workspace_id, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
      before_reserved_nanos, after_reserved_nanos, ref_type, ref_id, source_ref_type, source_ref_id, status
    ) values (
      p_workspace_id, 'charge', -p_actual_nanos, v_before_balance, v_wallet.balance_nanos,
      v_before_reserved, v_wallet.reserved_nanos,
      'async_job_charge', p_workspace_id::text || ':' || p_reservation_id,
      'async_job', coalesce(nullif(trim(p_settle_ref_id), ''), p_reservation_id), 'captured'
    );
  end if;

  return query select true, true, null::text, p_actual_nanos,
    v_before_balance, coalesce(v_wallet.balance_nanos, 0),
    v_before_reserved, coalesce(v_wallet.reserved_nanos, 0);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_settle_once"(uuid, text, bigint, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_settle_once"(uuid, text, bigint, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_wallet_settle_once"(uuid, text, bigint, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_wallet_settle_once"(uuid, text, bigint, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.stripe_apply_payment_intent_credit (
  p_workspace_id      uuid,
  p_payment_intent_id text,
  p_kind              text,
  p_amount_nanos      bigint,
  p_event_time        timestamp with time zone DEFAULT now()
)
  RETURNS TABLE (
    applied              boolean,
    before_balance_nanos bigint,
    after_balance_nanos  bigint,
    status               text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    v_existing public.credit_ledger%rowtype;
    v_before bigint;
    v_after bigint;
    v_kind text;
begin
    if p_workspace_id is null then
        raise exception 'missing_workspace_id';
    end if;

    if coalesce(trim(p_payment_intent_id), '') = '' then
        raise exception 'missing_payment_intent_id';
    end if;

    if p_amount_nanos is null or p_amount_nanos <= 0 then
        raise exception 'invalid_amount_nanos';
    end if;

    v_kind := case lower(coalesce(trim(p_kind), ''))
        when 'top_up_one_off' then 'top_up_one_off'
        when 'auto_top_up' then 'auto_top_up'
        else 'top_up'
    end;

    select *
    into v_existing
    from public.credit_ledger
    where ref_type = 'Stripe_Payment_Intent'
      and ref_id = p_payment_intent_id
    for update;

    if found and v_existing.workspace_id is not null and v_existing.workspace_id <> p_workspace_id then
        raise exception 'payment_intent_workspace_mismatch';
    end if;

    if found and lower(coalesce(v_existing.status, '')) in ('paid', 'succeeded') then
        return query
        select
            false,
            coalesce(v_existing.before_balance_nanos, 0)::bigint,
            coalesce(v_existing.after_balance_nanos, 0)::bigint,
            coalesce(v_existing.status, 'Paid');
        return;
    end if;

    if not found then
        insert into public.credit_ledger (
            workspace_id,
            kind,
            amount_nanos,
            before_balance_nanos,
            after_balance_nanos,
            ref_type,
            ref_id,
            status,
            event_time
        ) values (
            p_workspace_id,
            v_kind,
            0,
            0,
            0,
            'Stripe_Payment_Intent',
            p_payment_intent_id,
            'Applying',
            coalesce(p_event_time, now())
        );
    end if;

    update public.wallets
    set balance_nanos = balance_nanos + p_amount_nanos,
        updated_at = now()
    where workspace_id = p_workspace_id
    returning balance_nanos - p_amount_nanos, balance_nanos
    into v_before, v_after;

    if not found then
        raise exception 'wallet_not_found';
    end if;

    update public.credit_ledger
    set workspace_id = p_workspace_id,
        kind = v_kind,
        amount_nanos = p_amount_nanos,
        before_balance_nanos = v_before,
        after_balance_nanos = v_after,
        status = 'Paid',
        event_time = coalesce(p_event_time, now())
    where ref_type = 'Stripe_Payment_Intent'
      and ref_id = p_payment_intent_id;

    return query
    select true, v_before, v_after, 'Paid';
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."stripe_apply_payment_intent_credit"(uuid, text, text, bigint, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."stripe_apply_payment_intent_credit"(uuid, text, text, bigint, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."stripe_apply_payment_intent_credit"(uuid, text, text, bigint, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."stripe_apply_payment_intent_credit"(uuid, text, text, bigint, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.redeem_credit_code (
  p_code         text,
  p_workspace_id uuid
)
  RETURNS TABLE (
    status               text,
    message              text,
    grant_id             uuid,
    amount_nanos         bigint,
    before_balance_nanos bigint,
    after_balance_nanos  bigint,
    workspace_id         uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_user_id uuid := auth.uid();
  v_code_normalized text;
  v_grant public.credit_grants%rowtype;
  v_wallet public.wallets%rowtype;
  v_team_billing_mode text;
  v_redemption_id uuid;
begin
  if v_user_id is null then
    return query
    select
      'unauthorized'::text,
      'You must be signed in to redeem a credit code.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if p_workspace_id is null or not public.is_workspace_member(p_workspace_id) then
    return query
    select
      'team_forbidden'::text,
      'You do not have access to this team.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select lower(coalesce(t.billing_mode::text, 'wallet'))
  into v_team_billing_mode
  from public.workspaces t
  where t.id = p_workspace_id;

  if not found then
    return query
    select
      'team_forbidden'::text,
      'You do not have access to this team.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if v_team_billing_mode = 'invoice' then
    return query
    select
      'invoice_mode'::text,
      'Credit codes are not available for invoice billing teams.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  v_code_normalized := upper(trim(coalesce(p_code, '')));

  if v_code_normalized = ''
    or length(v_code_normalized) > 64
    or v_code_normalized !~ '^[A-Z0-9][A-Z0-9_-]{1,63}$'
  then
    return query
    select
      'invalid_code_format'::text,
      'Credit code format is invalid.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select *
  into v_grant
  from public.credit_grants cg
  where cg.code_normalized = v_code_normalized
  for update;

  if not found then
    return query
    select
      'not_found'::text,
      'This credit code is invalid.'::text,
      null::uuid,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if not coalesce(v_grant.is_active, false) then
    return query
    select
      'inactive'::text,
      'This credit code is inactive.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if v_grant.expires_at is not null and v_grant.expires_at <= now() then
    return query
    select
      'expired'::text,
      'This credit code has expired.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  if coalesce(v_grant.redemptions_count, 0) >= v_grant.max_redemptions then
    return query
    select
      'maxed_out'::text,
      'This credit code has reached its redemption limit.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  select *
  into v_wallet
  from public.wallets w
  where w.workspace_id = p_workspace_id
  for update;

  if not found then
    return query
    select
      'wallet_not_found'::text,
      'Wallet not found for this team.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  insert into public.credit_grant_redemptions (
    grant_id,
    user_id,
    workspace_id,
    amount_nanos
  ) values (
    v_grant.id,
    v_user_id,
    p_workspace_id,
    v_grant.amount_nanos
  )
  on conflict on constraint credit_grant_redemptions_grant_user_unique
  do nothing
  returning id
  into v_redemption_id;

  if v_redemption_id is null then
    return query
    select
      'already_redeemed'::text,
      'You have already redeemed this credit code.'::text,
      v_grant.id,
      null::bigint,
      null::bigint,
      null::bigint,
      p_workspace_id;
    return;
  end if;

  update public.wallets as w
  set balance_nanos = w.balance_nanos + v_grant.amount_nanos,
      updated_at = now()
  where w.workspace_id = p_workspace_id
  returning w.*
  into v_wallet;

  insert into public.credit_ledger (
    workspace_id,
    event_time,
    kind,
    amount_nanos,
    before_balance_nanos,
    after_balance_nanos,
    ref_type,
    ref_id,
    created_at,
    status
  ) values (
    p_workspace_id,
    now(),
    'promo_code',
    v_grant.amount_nanos,
    v_wallet.balance_nanos - v_grant.amount_nanos,
    v_wallet.balance_nanos,
    'promo_code_redeem',
    v_redemption_id::text,
    now(),
    'paid'
  ) on conflict (ref_type, ref_id) do nothing;

  update public.credit_grants
  set redemptions_count = redemptions_count + 1
  where id = v_grant.id;

  return query
  select
    'succeeded'::text,
    'Promo credit applied successfully.'::text,
    v_grant.id,
    v_grant.amount_nanos,
    v_wallet.balance_nanos - v_grant.amount_nanos,
    v_wallet.balance_nanos,
    p_workspace_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."redeem_credit_code"(text, uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."redeem_credit_code"(text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."redeem_credit_code"(text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."redeem_credit_code"(text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."redeem_credit_code"(text, uuid) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.stripe_claim_self_serve_refund (
  p_team_id           uuid,
  p_payment_intent_id text,
  p_user_id           uuid
)
  RETURNS TABLE (
    ok                   boolean,
    reason               text,
    amount_nanos         bigint,
    before_balance_nanos bigint,
    purchase_time        timestamp with time zone
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    v_purchase public.credit_ledger%rowtype;
    v_usage_nanos bigint := 0;
    v_has_active_refund boolean := false;
    v_claim_state text;
begin
    select *
    into v_purchase
    from public.credit_ledger
    where team_id = p_team_id
      and ref_type = 'Stripe_Payment_Intent'
      and ref_id = p_payment_intent_id
      and kind in ('top_up', 'top_up_one_off', 'auto_top_up')
    for update;

    if not found then
        return query select false, 'purchase_not_found', 0::bigint, 0::bigint, null::timestamptz;
        return;
    end if;

    if lower(coalesce(v_purchase.status, '')) not in ('paid', 'succeeded') then
        return query select false, 'purchase_not_paid', 0::bigint, 0::bigint, v_purchase.event_time;
        return;
    end if;

    if v_purchase.event_time < now() - interval '24 hours' then
        return query select false, 'window_expired', 0::bigint, 0::bigint, v_purchase.event_time;
        return;
    end if;

    v_claim_state := coalesce(v_purchase.refund_claim_state, '');
    if v_claim_state not in ('', 'Failed', 'Canceled', 'Rejected') then
        return query select false, 'refund_claim_in_progress', 0::bigint, 0::bigint, v_purchase.event_time;
        return;
    end if;

    select exists (
        select 1
        from public.credit_ledger cl
        where cl.team_id = p_team_id
          and cl.kind = 'refund'
          and cl.source_ref_type = 'Stripe_Payment_Intent'
          and cl.source_ref_id = p_payment_intent_id
          and coalesce(cl.status, '') in ('Pending', 'Applying', 'Processing', 'Succeeded')
    ) into v_has_active_refund;

    if v_has_active_refund then
        update public.credit_ledger
        set refund_claim_state = 'Requested',
            refund_claim_reason = 'Refund already in progress.',
            refund_claimed_at = now(),
            refund_claimed_by_user_id = p_user_id
        where id = v_purchase.id;

        return query select false, 'refund_already_exists', 0::bigint, v_purchase.before_balance_nanos, v_purchase.event_time;
        return;
    end if;

    select coalesce(sum(gr.cost_nanos), 0)::bigint
    into v_usage_nanos
    from private.v2_rpc_gateway_requests_compat gr
    where gr.team_id = p_team_id
      and gr.success is true
      and gr.created_at >= v_purchase.event_time;

    if v_usage_nanos > coalesce(v_purchase.before_balance_nanos, 0) then
        update public.credit_ledger
        set refund_claim_state = 'Rejected',
            refund_claim_reason = 'Credits from this top-up have already been used.',
            refund_claimed_at = now(),
            refund_claimed_by_user_id = p_user_id
        where id = v_purchase.id;

        return query select false, 'lot_used', 0::bigint, v_purchase.before_balance_nanos, v_purchase.event_time;
        return;
    end if;

    update public.credit_ledger
    set refund_claim_state = 'Applying',
        refund_claim_reason = null,
        refund_claimed_at = now(),
        refund_claimed_by_user_id = p_user_id
    where id = v_purchase.id;

    return query select true, null::text, v_purchase.amount_nanos, v_purchase.before_balance_nanos, v_purchase.event_time;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."stripe_claim_self_serve_refund"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."stripe_claim_self_serve_refund"(uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."stripe_claim_self_serve_refund"(uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."stripe_claim_self_serve_refund"(uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.wallet_apply_delta (
  p_workspace_id uuid,
  p_delta_nanos  bigint
)
  RETURNS TABLE (
    before_balance_nanos bigint,
    after_balance_nanos  bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
    v_before bigint;
    v_after bigint;
begin
    if p_workspace_id is null then
        raise exception 'missing_workspace_id';
    end if;

    update public.wallets
    set balance_nanos = balance_nanos + p_delta_nanos,
        updated_at = now()
    where workspace_id = p_workspace_id
    returning balance_nanos - p_delta_nanos, balance_nanos
    into v_before, v_after;

    if not found then
        raise exception 'wallet_not_found';
    end if;

    return query select v_before, v_after;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."wallet_apply_delta"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."wallet_apply_delta"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."wallet_apply_delta"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."wallet_apply_delta"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_charge_with_credit_cache (
  p_workspace_id                  uuid,
  p_request_id                    text,
  p_cost_nanos                    bigint,
  p_credit_snapshot_balance_nanos bigint DEFAULT NULL::bigint
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

GRANT EXECUTE ON FUNCTION "public"."gateway_charge_with_credit_cache"(uuid, text, bigint, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_charge_with_credit_cache"(uuid, text, bigint, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_charge_with_credit_cache"(uuid, text, bigint, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_charge_with_credit_cache"(uuid, text, bigint, bigint) FROM PUBLIC, "anon", "authenticated";
