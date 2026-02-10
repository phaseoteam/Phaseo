-- Stripe billing safety hardening:
-- 1) enforce idempotent ledger refs
-- 2) add atomic wallet balance update RPC

-- If duplicate ref pairs already exist, preserve rows by suffixing duplicates
-- so we can enforce uniqueness going forward.
with ranked as (
    select
        id,
        ref_type,
        ref_id,
        row_number() over (
            partition by ref_type, ref_id
            order by event_time asc, created_at asc, id asc
        ) as rn
    from public.credit_ledger
)
update public.credit_ledger cl
set ref_id = cl.ref_id || '#dup-' || left(cl.id::text, 8)
from ranked r
where cl.id = r.id
  and r.rn > 1;
create unique index if not exists credit_ledger_ref_type_ref_id_key
    on public.credit_ledger (ref_type, ref_id);
create index if not exists wallets_stripe_customer_id_idx
    on public.wallets (stripe_customer_id);
create or replace function public.wallet_apply_delta(
    p_team_id uuid,
    p_delta_nanos bigint
)
returns table(before_balance_nanos bigint, after_balance_nanos bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_before bigint;
    v_after bigint;
begin
    update public.wallets
    set balance_nanos = balance_nanos + p_delta_nanos,
        updated_at = now()
    where team_id = p_team_id
    returning balance_nanos - p_delta_nanos, balance_nanos
    into v_before, v_after;

    if not found then
        raise exception 'wallet_not_found';
    end if;

    return query select v_before, v_after;
end;
$$;
revoke all on function public.wallet_apply_delta(uuid, bigint) from public;
grant execute on function public.wallet_apply_delta(uuid, bigint) to service_role;
