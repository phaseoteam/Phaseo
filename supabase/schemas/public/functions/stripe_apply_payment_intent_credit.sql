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
