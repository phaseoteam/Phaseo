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
