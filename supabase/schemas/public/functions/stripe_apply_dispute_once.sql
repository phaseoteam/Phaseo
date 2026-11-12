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
