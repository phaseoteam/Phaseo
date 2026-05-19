alter table public.credit_ledger
    add column if not exists refund_claim_state text,
    add column if not exists refund_claim_reason text,
    add column if not exists refund_claimed_at timestamptz,
    add column if not exists refund_claimed_by_user_id uuid;
create index if not exists credit_ledger_refund_claim_state_idx
    on public.credit_ledger (refund_claim_state)
    where ref_type = 'Stripe_Payment_Intent';
create or replace function public.stripe_claim_self_serve_refund(
    p_team_id uuid,
    p_payment_intent_id text,
    p_user_id uuid
)
returns table(
    ok boolean,
    reason text,
    amount_nanos bigint,
    before_balance_nanos bigint,
    purchase_time timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
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
    from public.gateway_requests gr
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
$$;
revoke all on function public.stripe_claim_self_serve_refund(uuid, text, uuid) from public;
grant execute on function public.stripe_claim_self_serve_refund(uuid, text, uuid) to service_role;
