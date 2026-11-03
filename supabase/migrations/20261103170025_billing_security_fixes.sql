-- Billing security fixes from the 2026-11-03 review.
-- 1. Post-response charges always apply the real cost, even into overdraft;
--    gateway_request_charges.overdraft_nanos records the part the unreserved
--    balance did not cover. Admission already blocks a wallet under $0.10.
--    Batch settlement can always capture its own hold.
-- 2. Self-serve refunds: stripe_claim_self_serve_refund checks usage in SQL,
--    respects holds, never goes below zero and debits the wallet atomically.
-- 3. stripe_apply_refund_once applies each Stripe refund to the wallet once.
-- 4. stripe_apply_dispute_once applies chargebacks once (allows overdraft).
-- 5. One auto top-up in flight per wallet; auto_top_up_amount is limited to
--    the range the Stripe webhook credits ($5 to $1,000,000).
-- 6. A credit code can be redeemed once per workspace.

alter table public.wallets
  add column if not exists auto_top_up_in_flight_until timestamp with time zone;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wallets_auto_top_up_amount_check' and conrelid = 'public.wallets'::regclass) then
    alter table public.wallets
      add constraint wallets_auto_top_up_amount_check
      check (auto_top_up_amount = 0 or (auto_top_up_amount >= 5000000000::bigint and auto_top_up_amount <= 1000000000000000::bigint));
  end if;
end $$;

alter table public.gateway_request_charges
  add column if not exists overdraft_nanos bigint not null default 0;

alter table public.credit_ledger
  add column if not exists wallet_debited boolean;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'credit_grant_redemptions_grant_workspace_unique' and conrelid = 'public.credit_grant_redemptions'::regclass) then
    alter table public.credit_grant_redemptions
      add constraint credit_grant_redemptions_grant_workspace_unique unique (grant_id, workspace_id);
  end if;
end $$;

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
  -- remain excluded from spendable balance. The held amount is always
  -- capturable, even when a post-response charge has taken the wallet into
  -- overdraft (balance below reserved).
  v_available_for_settlement := greatest(
    coalesce(v_wallet.balance_nanos, 0) - coalesce(v_wallet.reserved_nanos, 0) + v_reservation.amount_nanos,
    v_reservation.amount_nanos
  );
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
        -- A credited auto top-up has settled, so the next low balance may trigger another.
        auto_top_up_in_flight_until = case when v_kind = 'auto_top_up' then null else auto_top_up_in_flight_until end,
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

  -- One redemption per workspace as well as per user, so several members can't
  -- each redeem the same code into one workspace. The grant row lock above
  -- serializes redemptions of this code.
  if exists (
    select 1
    from public.credit_grant_redemptions r
    where r.grant_id = v_grant.id
      and r.workspace_id = p_workspace_id
  ) then
    return query
    select
      'already_redeemed'::text,
      'This credit code has already been redeemed for this team.'::text,
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
  on conflict do nothing
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

-- The claim now also returns claim_ref_id, so the old signature is replaced.
DROP FUNCTION IF EXISTS public.stripe_claim_self_serve_refund(uuid, text, uuid);

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
    purchase_time        timestamp with time zone,
    claim_ref_id         text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
-- Checks a self-serve refund and takes the top-up's credits out of the wallet
-- in one transaction, before the Stripe refund is created. p_team_id is the
-- workspace id. On success the wallet has been debited by amount_nanos and a
-- Stripe_Refund ledger row claim_ref_id ("self_serve_claim:...") holds the
-- debit until stripe_apply_refund_once links it to the Stripe refund (or gives
-- it back). The route uses claim_ref_id in the Stripe idempotency key, so each
-- claim creates its own Stripe refund.
declare
    v_purchase public.credit_ledger%rowtype;
    v_wallet public.wallets%rowtype;
    v_usage_nanos bigint := 0;
    v_has_active_refund boolean := false;
    v_claim_state text;
    v_amount bigint;
    v_claim_ref_id text;
begin
    if p_team_id is null or coalesce(trim(p_payment_intent_id), '') = '' then
        raise exception 'invalid_refund_claim';
    end if;

    -- Locks the purchase: concurrent claims and refund webhooks for this
    -- payment wait here.
    select *
    into v_purchase
    from public.credit_ledger
    where workspace_id = p_team_id
      and ref_type = 'Stripe_Payment_Intent'
      and ref_id = p_payment_intent_id
      and kind in ('top_up', 'top_up_one_off', 'auto_top_up')
    for update;

    if not found then
        return query select false, 'purchase_not_found', 0::bigint, 0::bigint, null::timestamptz, null::text;
        return;
    end if;

    -- A claim still unlinked after 15 minutes was abandoned: the route lost the
    -- claim response or stopped before creating the Stripe refund. Its debit
    -- is given back so the customer isn't stuck. 15 minutes is longer than the
    -- route can run (its Stripe calls time out well before that), so no live
    -- request still holds it. If a Stripe refund was created after all, its
    -- webhook finds no open claim and applies it like a dashboard refund:
    -- debited once when it succeeds.
    v_claim_state := coalesce(v_purchase.refund_claim_state, '');
    if v_claim_state = 'Applying'
       and coalesce(v_purchase.refund_claimed_at, '-infinity'::timestamptz) < now() - interval '15 minutes' then
        with open_claims as (
            select cl.id, case when cl.wallet_debited then abs(cl.amount_nanos) else 0 end as restore_nanos
            from public.credit_ledger cl
            where cl.ref_type = 'Stripe_Refund'
              and cl.workspace_id = p_team_id
              and cl.source_ref_type = 'Stripe_Payment_Intent'
              and cl.source_ref_id = p_payment_intent_id
              and cl.ref_id like 'self_serve_claim:%'
              and cl.status = 'Applying'
            for update
        ), released as (
            update public.credit_ledger cl
            set status = 'Canceled',
                wallet_debited = false,
                event_time = now()
            from open_claims o
            where cl.id = o.id
            returning o.restore_nanos
        )
        update public.wallets w
        set balance_nanos = w.balance_nanos + r.restore_nanos,
            updated_at = now()
        from (select coalesce(sum(restore_nanos), 0)::bigint as restore_nanos from released) r
        where w.workspace_id = p_team_id
          and r.restore_nanos > 0;

        update public.credit_ledger
        set refund_claim_state = 'Canceled'
        where id = v_purchase.id;
        v_claim_state := 'Canceled';
    end if;

    if lower(coalesce(v_purchase.status, '')) not in ('paid', 'succeeded') then
        return query select false, 'purchase_not_paid', 0::bigint, 0::bigint, v_purchase.event_time, null::text;
        return;
    end if;

    if v_purchase.event_time < now() - interval '24 hours' then
        return query select false, 'window_expired', 0::bigint, 0::bigint, v_purchase.event_time, null::text;
        return;
    end if;

    v_amount := coalesce(v_purchase.amount_nanos, 0);
    if v_amount <= 0 then
        return query select false, 'invalid_amount', 0::bigint, 0::bigint, v_purchase.event_time, null::text;
        return;
    end if;

    if v_claim_state not in ('', 'Failed', 'Canceled', 'Rejected') then
        return query select false, 'refund_claim_in_progress', 0::bigint, 0::bigint, v_purchase.event_time, null::text;
        return;
    end if;

    select exists (
        select 1
        from public.credit_ledger cl
        where cl.workspace_id = p_team_id
          and cl.kind = 'refund'
          and cl.source_ref_type = 'Stripe_Payment_Intent'
          and cl.source_ref_id = p_payment_intent_id
          and lower(coalesce(cl.status, '')) in ('pending', 'applying', 'processing', 'succeeded')
    ) into v_has_active_refund;

    if v_has_active_refund then
        return query select false, 'refund_already_exists', 0::bigint, 0::bigint, v_purchase.event_time, null::text;
        return;
    end if;

    select coalesce(sum(gr.cost_nanos), 0)::bigint
    into v_usage_nanos
    from public.gateway_requests gr
    where gr.workspace_id = p_team_id
      and gr.success is true
      and gr.cost_nanos > 0
      and gr.created_at >= v_purchase.event_time;

    select *
    into v_wallet
    from public.wallets
    where workspace_id = p_team_id
    for update;

    if not found then
        return query select false, 'wallet_not_found', 0::bigint, 0::bigint, v_purchase.event_time, null::text;
        return;
    end if;

    -- Full lot only: usage since the purchase must fit in the balance before
    -- it, and the refund may not take the unreserved balance below zero
    -- (batch and realtime holds stay covered).
    if v_usage_nanos > coalesce(v_purchase.before_balance_nanos, 0)
       or v_wallet.balance_nanos - coalesce(v_wallet.reserved_nanos, 0) - v_amount < 0 then
        update public.credit_ledger
        set refund_claim_state = 'Rejected',
            refund_claim_reason = 'Credits from this top-up have already been used.',
            refund_claimed_at = now(),
            refund_claimed_by_user_id = p_user_id
        where id = v_purchase.id;

        return query select false, 'lot_used', 0::bigint, v_wallet.balance_nanos, v_purchase.event_time, null::text;
        return;
    end if;

    update public.wallets
    set balance_nanos = balance_nanos - v_amount,
        updated_at = now()
    where workspace_id = p_team_id;

    v_claim_ref_id := 'self_serve_claim:' || p_payment_intent_id || ':' || gen_random_uuid()::text;
    insert into public.credit_ledger (
        workspace_id, event_time, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
        ref_type, ref_id, status, source_ref_type, source_ref_id, wallet_debited
    ) values (
        p_team_id, now(), 'refund', -v_amount, v_wallet.balance_nanos, v_wallet.balance_nanos - v_amount,
        'Stripe_Refund', v_claim_ref_id,
        'Applying', 'Stripe_Payment_Intent', p_payment_intent_id, true
    );

    update public.credit_ledger
    set refund_claim_state = 'Applying',
        refund_claim_reason = null,
        refund_claimed_at = now(),
        refund_claimed_by_user_id = p_user_id
    where id = v_purchase.id;

    return query select true, null::text, v_amount, v_wallet.balance_nanos, v_purchase.event_time, v_claim_ref_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."stripe_claim_self_serve_refund"(uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."stripe_claim_self_serve_refund"(uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."stripe_claim_self_serve_refund"(uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."stripe_claim_self_serve_refund"(uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.stripe_apply_refund_once (
  p_workspace_id      uuid,
  p_payment_intent_id text,
  p_refund_id         text,
  p_refund_net_nanos  bigint,
  p_status            text
)
  RETURNS TABLE (
    applied              boolean,
    wallet_debited       boolean,
    before_balance_nanos bigint,
    after_balance_nanos  bigint,
    status               text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
-- Applies a Stripe refund to the wallet exactly once, keyed on the refund id.
-- The self-serve route and the refund.created / refund.updated webhooks all
-- call this. A succeeded refund debits the wallet once (it may go negative:
-- the money has already been returned); a failed or canceled one gives a
-- debit back. An open self-serve claim for the payment already holds the
-- debit, so it is linked to the refund id instead of debiting again. With
-- p_refund_id null it ends the open claim (Stripe refund not created).
declare
    v_status text;
    v_purchase public.credit_ledger%rowtype;
    v_row public.credit_ledger%rowtype;
    v_found boolean := false;
    v_debited boolean;
    v_amount bigint;
    v_before bigint;
    v_after bigint;
    v_applied boolean := false;
begin
    if p_workspace_id is null then
        raise exception 'missing_workspace_id';
    end if;
    if coalesce(trim(p_payment_intent_id), '') = '' then
        raise exception 'missing_payment_intent_id';
    end if;

    v_status := case lower(trim(coalesce(p_status, '')))
        when 'succeeded' then 'Succeeded'
        when 'failed' then 'Failed'
        when 'canceled' then 'Canceled'
        when 'cancelled' then 'Canceled'
        else 'Pending'
    end;

    -- Same first lock as stripe_claim_self_serve_refund.
    select *
    into v_purchase
    from public.credit_ledger
    where ref_type = 'Stripe_Payment_Intent'
      and ref_id = p_payment_intent_id
    for update;

    if found and v_purchase.workspace_id <> p_workspace_id then
        raise exception 'payment_intent_workspace_mismatch';
    end if;

    if p_refund_id is not null then
        select *
        into v_row
        from public.credit_ledger
        where ref_type = 'Stripe_Refund'
          and ref_id = p_refund_id
        for update;
        v_found := found;
        if v_found and v_row.workspace_id <> p_workspace_id then
            raise exception 'refund_workspace_mismatch';
        end if;
        -- A failed or canceled refund id never takes over a newer claim's
        -- debit (e.g. Stripe returned the old refund for a reused idempotency
        -- key): the open claim is given back instead of left orphaned.
        if v_found and v_row.status in ('Failed', 'Canceled') then
            with open_claims as (
                select cl.id, case when cl.wallet_debited then abs(cl.amount_nanos) else 0 end as restore_nanos
                from public.credit_ledger cl
                where cl.ref_type = 'Stripe_Refund'
                  and cl.workspace_id = p_workspace_id
                  and cl.source_ref_type = 'Stripe_Payment_Intent'
                  and cl.source_ref_id = p_payment_intent_id
                  and cl.ref_id like 'self_serve_claim:%'
                  and cl.status = 'Applying'
                for update
            ), released as (
                update public.credit_ledger cl
                set status = 'Canceled',
                    wallet_debited = false,
                    event_time = now()
                from open_claims o
                where cl.id = o.id
                returning o.restore_nanos
            )
            update public.wallets w
            set balance_nanos = w.balance_nanos + r.restore_nanos,
                updated_at = now()
            from (select coalesce(sum(restore_nanos), 0)::bigint as restore_nanos from released) r
            where w.workspace_id = p_workspace_id
              and r.restore_nanos > 0;
        end if;
    end if;

    if not v_found then
        select cl.*
        into v_row
        from public.credit_ledger cl
        where cl.ref_type = 'Stripe_Refund'
          and cl.workspace_id = p_workspace_id
          and cl.source_ref_type = 'Stripe_Payment_Intent'
          and cl.source_ref_id = p_payment_intent_id
          and cl.ref_id like 'self_serve_claim:%'
          and cl.status = 'Applying'
        order by cl.created_at desc
        limit 1
        for update;
        v_found := found;

        if v_found and p_refund_id is not null then
            update public.credit_ledger
            set ref_id = p_refund_id
            where id = v_row.id;
            v_row.ref_id := p_refund_id;
        elsif v_found then
            -- No Stripe refund was created for this claim.
            if v_status = 'Pending' then
                v_status := 'Canceled';
            end if;
        elsif p_refund_id is null then
            return query select false, false, null::bigint, null::bigint, 'claim_not_found'::text;
            return;
        else
            if p_refund_net_nanos is null or p_refund_net_nanos <= 0 then
                raise exception 'invalid_refund_amount';
            end if;
            select w.balance_nanos into v_before from public.wallets w where w.workspace_id = p_workspace_id;
            insert into public.credit_ledger (
                workspace_id, event_time, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
                ref_type, ref_id, status, source_ref_type, source_ref_id, wallet_debited
            ) values (
                p_workspace_id, now(), 'refund', -p_refund_net_nanos, coalesce(v_before, 0), coalesce(v_before, 0),
                'Stripe_Refund', p_refund_id, v_status, 'Stripe_Payment_Intent', p_payment_intent_id, false
            )
            returning * into v_row;
        end if;
    end if;

    -- A late refund.created (pending) doesn't reopen a settled refund.
    if v_status = 'Pending' and v_row.status in ('Succeeded', 'Failed', 'Canceled') then
        v_status := v_row.status;
    end if;
    -- Failed and canceled are final for a refund id: a stale succeeded (or
    -- pending) event delivered after the failure must not debit again.
    if v_row.status in ('Failed', 'Canceled') then
        v_status := v_row.status;
    end if;

    -- Rows written before wallet_debited existed count as debited when the
    -- old code recorded a balance change on a succeeded refund.
    v_debited := coalesce(
        v_row.wallet_debited,
        lower(coalesce(v_row.status, '')) = 'succeeded' and v_row.before_balance_nanos <> v_row.after_balance_nanos
    );

    if not v_debited and p_refund_net_nanos is not null and p_refund_net_nanos > 0 then
        v_row.amount_nanos := -p_refund_net_nanos;
    end if;
    v_amount := abs(coalesce(v_row.amount_nanos, 0));
    v_before := v_row.before_balance_nanos;
    v_after := v_row.after_balance_nanos;

    if v_amount > 0 and (
        (v_status = 'Succeeded' and not v_debited)
        or (v_status in ('Failed', 'Canceled') and v_debited)
    ) then
        update public.wallets w
        set balance_nanos = w.balance_nanos + case when v_debited then v_amount else -v_amount end,
            updated_at = now()
        where w.workspace_id = p_workspace_id
        returning w.balance_nanos - case when v_debited then v_amount else -v_amount end, w.balance_nanos
        into v_before, v_after;
        if not found then
            raise exception 'wallet_not_found';
        end if;
        v_debited := not v_debited;
        v_applied := true;
    end if;

    update public.credit_ledger
    set status = v_status,
        amount_nanos = v_row.amount_nanos,
        before_balance_nanos = v_before,
        after_balance_nanos = v_after,
        wallet_debited = v_debited,
        event_time = now()
    where id = v_row.id;

    if v_purchase.id is not null and coalesce(v_purchase.refund_claim_state, '') in ('Applying', 'Requested') then
        update public.credit_ledger
        set refund_claim_state = case v_status when 'Pending' then 'Requested' else v_status end
        where id = v_purchase.id;
    end if;

    return query select v_applied, v_debited, v_before, v_after, v_status;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."stripe_apply_refund_once"(uuid, text, text, bigint, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."stripe_apply_refund_once"(uuid, text, text, bigint, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."stripe_apply_refund_once"(uuid, text, text, bigint, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."stripe_apply_refund_once"(uuid, text, text, bigint, text) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.stripe_apply_dispute_once (
  p_workspace_id      uuid,
  p_payment_intent_id text,
  p_dispute_id        text,
  p_amount_nanos      bigint,
  p_status            text
)
  RETURNS TABLE (
    applied              boolean,
    wallet_debited       boolean,
    before_balance_nanos bigint,
    after_balance_nanos  bigint,
    status               text
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
-- Applies a Stripe dispute (chargeback) to the wallet exactly once, keyed on
-- the dispute id. An open or lost dispute takes the disputed credit out of the
-- wallet, which may go negative so the workspace is blocked until it tops up.
-- A won dispute (or an inquiry closed without a chargeback) gives it back.
declare
    v_status text := lower(trim(coalesce(p_status, '')));
    v_restore boolean;
    v_purchase public.credit_ledger%rowtype;
    v_row public.credit_ledger%rowtype;
    v_amount bigint;
    v_before bigint;
    v_after bigint;
    v_debited boolean;
    v_applied boolean := false;
begin
    if p_workspace_id is null then
        raise exception 'missing_workspace_id';
    end if;
    if coalesce(trim(p_dispute_id), '') = '' then
        raise exception 'missing_dispute_id';
    end if;
    if v_status = '' then
        raise exception 'missing_dispute_status';
    end if;
    v_restore := v_status in ('won', 'warning_closed');

    if coalesce(trim(p_payment_intent_id), '') <> '' then
        -- Same first lock as the refund functions for this payment.
        select *
        into v_purchase
        from public.credit_ledger
        where ref_type = 'Stripe_Payment_Intent'
          and ref_id = p_payment_intent_id
        for update;
        if found and v_purchase.workspace_id <> p_workspace_id then
            raise exception 'payment_intent_workspace_mismatch';
        end if;
    end if;

    select *
    into v_row
    from public.credit_ledger
    where ref_type = 'Stripe_Dispute'
      and ref_id = p_dispute_id
    for update;

    if found and v_row.workspace_id <> p_workspace_id then
        raise exception 'dispute_workspace_mismatch';
    end if;

    -- A closed dispute stays closed if an older event arrives late.
    if found and v_row.status in ('won', 'lost', 'warning_closed')
       and v_status not in ('won', 'lost', 'warning_closed') then
        v_status := v_row.status;
        v_restore := v_status in ('won', 'warning_closed');
    end if;

    if not found then
        if p_amount_nanos is null or p_amount_nanos <= 0 then
            raise exception 'invalid_dispute_amount';
        end if;
        select w.balance_nanos into v_before from public.wallets w where w.workspace_id = p_workspace_id;
        insert into public.credit_ledger (
            workspace_id, event_time, kind, amount_nanos, before_balance_nanos, after_balance_nanos,
            ref_type, ref_id, status, source_ref_type, source_ref_id, wallet_debited
        ) values (
            p_workspace_id, now(), 'chargeback', -p_amount_nanos, coalesce(v_before, 0), coalesce(v_before, 0),
            'Stripe_Dispute', p_dispute_id, v_status, 'Stripe_Payment_Intent', nullif(trim(p_payment_intent_id), ''), false
        )
        returning * into v_row;
    end if;

    v_debited := coalesce(v_row.wallet_debited, false);
    v_amount := abs(coalesce(v_row.amount_nanos, 0));
    v_before := v_row.before_balance_nanos;
    v_after := v_row.after_balance_nanos;

    if v_amount > 0 and v_restore = v_debited then
        update public.wallets w
        set balance_nanos = w.balance_nanos + case when v_debited then v_amount else -v_amount end,
            updated_at = now()
        where w.workspace_id = p_workspace_id
        returning w.balance_nanos - case when v_debited then v_amount else -v_amount end, w.balance_nanos
        into v_before, v_after;
        if not found then
            raise exception 'wallet_not_found';
        end if;
        v_debited := not v_debited;
        v_applied := true;
    end if;

    update public.credit_ledger
    set status = v_status,
        before_balance_nanos = v_before,
        after_balance_nanos = v_after,
        wallet_debited = v_debited,
        event_time = now()
    where id = v_row.id;

    return query select v_applied, v_debited, v_before, v_after, v_status;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."stripe_apply_dispute_once"(uuid, text, text, bigint, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."stripe_apply_dispute_once"(uuid, text, text, bigint, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."stripe_apply_dispute_once"(uuid, text, text, bigint, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."stripe_apply_dispute_once"(uuid, text, text, bigint, text) FROM PUBLIC, "anon", "authenticated";

