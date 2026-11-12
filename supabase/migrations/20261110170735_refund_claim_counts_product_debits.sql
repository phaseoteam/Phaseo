SET LOCAL lock_timeout = '10s';

-- Functions only: no table is locked here.
--
-- A self-serve refund claim counts every debit taken from credits since the purchase. Phaseo
-- Connect (charge_connect_month) and the Slack agent (charge_slack_agent_month) debit the wallet
-- directly with a captured 'charge' ledger row, which none of the claim's usage terms counted: a
-- workspace that paid for Connect from a top-up, then topped up again, could have the first top-up
-- refunded as unused. The claim now counts every captured 'charge' debit since the purchase, once,
-- at its debit time, except the kinds it already counts elsewhere: async_job_charge (batch and video
-- holds) and realtime_session (its cost is on the session's gateway_requests row). A product that
-- later charges the wallet directly is counted without another change here.
-- The body is the one from 20261110140729_refund_claim_counts_under_recorded_charges with only that
-- term added.

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

    -- Every charge debited since the purchase is usage, counted once and by
    -- when the debit happened. Money movements win over audit rows: a
    -- request's row counts only when it has no movements of its own, which
    -- matches the budget readers (private.budget_spend_items):
    -- 1. Request rows with a cost, successful or not (a stream the client left
    --    can keep its charge on a 499 row), except rows whose movements count
    --    instead: stepped requests (2.), requests pending reconciliation with
    --    an applied charge row (3.), a debited batch's batch_usage rows and the
    --    batch_hold_usage placeholders of a reservation (4., 5.), and a video
    --    whose video_hold reservation was debited (5.).
    -- 2. Stepped charges (streams charged at drain checkpoints) through their
    --    adjustment ledger rows (gateway_charge_request_total writes one per
    --    debit or refund): a request that started before the purchase can
    --    still debit it at later checkpoints.
    -- 3. One-off charges no request row records (billing_request_id, with
    --    gateway_requests_workspace_billing_request_idx): an audit row that
    --    never landed, or one pending reconciliation. When none of its rows
    --    succeeded and none is pending, what their cost (which 1. counts) falls
    --    short of the charge: a Worker older than the lost-charge fix wrote a
    --    failure after a confirmed debit with no cost, and that row would
    --    otherwise hide the debit. As private.unbilled_spend counts it.
    -- 4. Batch captures (batch_capture:<batch> charge rows), whole, at their
    --    debit time.
    -- 5. Reserved batches and videos, settled or captured from their
    --    batch_hold or video_hold reservation into an async_job_charge ledger
    --    row: the debit, whole, at its time.
    -- 6. The unpaid part of a request pending reconciliation: its
    --    expected_cost_nanos less what is already counted for it, when positive.
    --    Counted is its applied charge when it has one (2. or 3. count it, and
    --    1. leaves its rows out); otherwise its rows' own cost, which 1. counts.
    --    Per billing request id, or request id without one, as the budget
    --    readers do (private.unbilled_spend).
    -- 7. Every other debit taken from credits (a captured 'charge' ledger row):
    --    Phaseo Connect months, Slack agent months, and any product that later
    --    charges the wallet directly, at their debit time. Left out are the
    --    debits counted above: async_job_charge (5.) and realtime_session, whose
    --    session cost is written to its gateway_requests row (1.). Stepped
    --    charges are 'adjustment' rows (2.); refunds and chargebacks are not
    --    usage.
    -- Pending reconciliation: expected_cost_nanos is set or, for rows written
    -- before private.pending_json_cutoff() (the deploy's marker: from then on
    -- every pending row carries the column), the audit's
    -- accounting_finalization.billing_status says so.
    select coalesce(sum(gr.cost_nanos), 0)::bigint
    into v_usage_nanos
    from public.gateway_requests gr
    where gr.workspace_id = p_team_id
      and gr.cost_nanos > 0
      and gr.created_at >= v_purchase.event_time
      and not (gr.billing_request_id is not null and (
        exists (
          select 1 from public.credit_ledger adjustment
          where adjustment.ref_type = 'gateway_request_charge'
            and adjustment.source_ref_type = 'gateway_request'
            and adjustment.source_ref_id = gr.billing_request_id
            and adjustment.workspace_id = gr.workspace_id
        )
        or (exists (
          select 1 from public.gateway_requests pending
          where pending.workspace_id = gr.workspace_id
            and pending.billing_request_id = gr.billing_request_id
            and (pending.expected_cost_nanos is not null
              or (pending.created_at < (select private.pending_json_cutoff())
                and pending.detail_metadata #>> '{accounting_finalization,billing_status}' = 'pending_reconciliation'))
        ) and exists (
          select 1 from public.gateway_request_charges charge
          where charge.workspace_id = gr.workspace_id
            and charge.request_id = gr.billing_request_id
            and charge.status = 'applied'
        ))
      ))
      and not (starts_with(gr.request_id, 'batch_usage:') and (
        exists (
          select 1 from public.gateway_request_charges capture
          where capture.workspace_id = gr.workspace_id
            and capture.request_id = 'batch_capture:' || split_part(gr.request_id, ':', 2)
            and capture.status = 'applied'
        )
        or exists (
          select 1 from public.credit_ledger debit
          where debit.source_ref_type = 'async_job'
            and debit.source_ref_id = split_part(gr.request_id, ':', 2)
            and debit.workspace_id = gr.workspace_id
            and debit.ref_type = 'async_job_charge'
        )
      ))
      and not (starts_with(gr.request_id, 'batch_hold_usage:') and exists (
        select 1 from public.gateway_wallet_reservations hold
        where hold.workspace_id = gr.workspace_id
          and hold.reservation_id = regexp_replace(substr(gr.request_id, 18), ':[^:]*$', '')
      ))
      and not exists (
        select 1 from public.credit_ledger debit
        where debit.ref_type = 'async_job_charge'
          and debit.ref_id = gr.workspace_id::text || ':video_hold:' || gr.request_id
      );

    v_usage_nanos := v_usage_nanos + coalesce((
      select -sum(adjustment.amount_nanos)
      from public.credit_ledger adjustment
      where adjustment.workspace_id = p_team_id
        and adjustment.ref_type = 'gateway_request_charge'
        and adjustment.created_at >= v_purchase.event_time
    ), 0)::bigint;

    v_usage_nanos := v_usage_nanos + coalesce((
      select sum(case when audit.found and not audit.pending
        then charge.cost_nanos - audit.row_cost else charge.cost_nanos end)
      from public.gateway_request_charges charge
      left join lateral (
        select count(*) > 0 as found,
          coalesce(bool_or(request.success is true), false) as succeeded,
          coalesce(bool_or(request.expected_cost_nanos is not null
            or (request.created_at < (select private.pending_json_cutoff())
              and coalesce(request.detail_metadata #>> '{accounting_finalization,billing_status}' = 'pending_reconciliation', false))), false) as pending,
          coalesce(sum(greatest(coalesce(request.cost_nanos, 0), 0)), 0) as row_cost
        from public.gateway_requests request
        where request.workspace_id = charge.workspace_id
          and request.billing_request_id = charge.request_id
      ) audit on true
      where charge.workspace_id = p_team_id
        and charge.status = 'applied'
        and charge.cost_nanos > 0
        and charge.created_at >= v_purchase.event_time
        and not starts_with(charge.request_id, 'batch_capture:')
        and (not audit.found or audit.pending or (not audit.succeeded and charge.cost_nanos > audit.row_cost))
        and not exists (
          select 1 from public.credit_ledger adjustment
          where adjustment.ref_type = 'gateway_request_charge'
            and adjustment.source_ref_type = 'gateway_request'
            and adjustment.source_ref_id = charge.request_id
            and adjustment.workspace_id = charge.workspace_id
        )
    ), 0)::bigint;

    v_usage_nanos := v_usage_nanos + coalesce((
      select sum(charge.cost_nanos)
      from public.gateway_request_charges charge
      where charge.workspace_id = p_team_id
        and charge.status = 'applied'
        and charge.cost_nanos > 0
        and charge.created_at >= v_purchase.event_time
        and starts_with(charge.request_id, 'batch_capture:')
    ), 0)::bigint;

    v_usage_nanos := v_usage_nanos + coalesce((
      select -sum(debit.amount_nanos)
      from public.credit_ledger debit
      where debit.workspace_id = p_team_id
        and debit.ref_type = 'async_job_charge'
        and (starts_with(debit.ref_id, p_team_id::text || ':batch_hold:')
          or starts_with(debit.ref_id, p_team_id::text || ':video_hold:'))
        and debit.amount_nanos < 0
        and debit.created_at >= v_purchase.event_time
    ), 0)::bigint;

    v_usage_nanos := v_usage_nanos + coalesce((
      select -sum(debit.amount_nanos)
      from public.credit_ledger debit
      where debit.workspace_id = p_team_id
        and debit.kind = 'charge'
        and debit.status = 'captured'
        and debit.amount_nanos < 0
        and debit.ref_type not in ('async_job_charge', 'realtime_session')
        and debit.created_at >= v_purchase.event_time
    ), 0)::bigint;

    v_usage_nanos := v_usage_nanos + coalesce((
      select sum(greatest(0, pending.expected_nanos - coalesce(charge.cost_nanos, pending.row_cost)))
      from (
        select coalesce(gr.billing_request_id, gr.request_id) as billing_request_id,
          bool_or(gr.billing_request_id is not null) as has_billing_id,
          max(gr.expected_cost_nanos) as expected_nanos,
          sum(greatest(coalesce(gr.cost_nanos, 0), 0)) as row_cost
        from public.gateway_requests gr
        where gr.workspace_id = p_team_id
          and gr.expected_cost_nanos is not null
          and gr.created_at >= v_purchase.event_time
        group by coalesce(gr.billing_request_id, gr.request_id)
      ) pending
      left join public.gateway_request_charges charge
        on pending.has_billing_id
       and charge.workspace_id = p_team_id
       and charge.request_id = pending.billing_request_id
       and charge.status = 'applied'
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
