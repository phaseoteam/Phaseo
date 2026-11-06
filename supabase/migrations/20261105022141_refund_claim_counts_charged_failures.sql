-- Self-serve refund claims count every charge on a top-up's credits as usage:
-- 1. Unsuccessful gateway_requests rows with a cost. A stream the client left
--    can keep its drain checkpoint charge on a 499 row; counting only success
--    rows made a partly used purchase look unused and refundable.
-- 2. Open stepped charges with no request row. A stream whose drain the
--    runtime stopped has only its gateway_request_charges row (is_final =
--    false); it is counted unless a gateway_requests row with that
--    billing_request_id already records it. Ledger adjustment rows are not read.
-- The body is the one from 20261104193047_billing_security_fixes with only the
-- usage query changed. Depends on gateway_request_charges.is_final
-- (20261104231117_gateway_charge_request_total).

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

    -- Every charged request is usage, successful or not: a stream the client
    -- left can keep its charge on an unsuccessful (499) row. A stream whose
    -- drain the runtime stopped has only its open stepped charge row
    -- (is_final = false) and no gateway_requests row: count that charge too,
    -- unless a request row records it (billing_request_id), so nothing is
    -- counted twice. Ledger adjustment rows are not read.
    select coalesce(sum(gr.cost_nanos), 0)::bigint
    into v_usage_nanos
    from public.gateway_requests gr
    where gr.workspace_id = p_team_id
      and gr.cost_nanos > 0
      and gr.created_at >= v_purchase.event_time;

    v_usage_nanos := v_usage_nanos + coalesce((
      select sum(charge.cost_nanos)
      from public.gateway_request_charges charge
      where charge.workspace_id = p_team_id
        and charge.is_final = false
        and charge.status = 'applied'
        and charge.cost_nanos > 0
        and charge.created_at >= v_purchase.event_time
        and not exists (
          select 1 from public.gateway_requests gr
          where gr.workspace_id = charge.workspace_id
            and gr.billing_request_id = charge.request_id
            -- The request row is written within a day of its charge; the bound
            -- keeps this to the workspace's recent partitions.
            and gr.created_at between charge.created_at - interval '1 day' and charge.created_at + interval '1 day'
        )
    ), 0)::bigint;

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
