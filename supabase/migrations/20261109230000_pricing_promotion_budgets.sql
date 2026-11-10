-- Purpose: Cap how much usage a promotional price can sell.
-- Why: A promotional price is an ordinary SKU with a higher meter priority and an
-- effective_from / effective_to window; the gateway and the model pages already
-- price and show it. Nothing stopped it before its end time, so a promotion could
-- not be limited to a dollar amount.
-- How: v2_pricing_promotions names the promotional SKUs, their discount and a
-- budget in list-price nanos (what the usage would have cost at the undiscounted
-- price). Every minute, enforce_pricing_promotion_budgets() sums the charged
-- pricing lines of those SKUs since the promotion started, converts them back to
-- list price, and once the budget is reached ends the SKUs (effective_to = now()).
-- The SKU update fires the existing routing-catalogue invalidation, and gateway
-- price caches hold a card for at most 60 seconds, so overshoot is bounded by
-- about two minutes of traffic.

create table if not exists public.v2_pricing_promotions (
  promotion_id uuid primary key default gen_random_uuid(),
  label text not null,
  sku_ids uuid[] not null check (cardinality(sku_ids) > 0),
  discount_bps integer not null check (discount_bps > 0 and discount_bps < 10000),
  budget_nanos bigint not null check (budget_nanos > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  spent_nanos bigint not null default 0,
  checked_at timestamptz,
  exhausted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v2_pricing_promotions_window_check check (ends_at > starts_at)
);

comment on table public.v2_pricing_promotions is
  'Budget caps for promotional SKUs. budget_nanos and spent_nanos are list-price (undiscounted) value; enforce_pricing_promotion_budgets() ends the SKUs once spent_nanos reaches budget_nanos.';

alter table public.v2_pricing_promotions enable row level security;
create policy "service_role_full_access" on public.v2_pricing_promotions
  for all to service_role using (true) with check (true);
revoke all on table public.v2_pricing_promotions from anon, authenticated, service_role;
grant delete, insert, select, update on table public.v2_pricing_promotions to service_role;

-- The spend sum uses the existing v2_request_pricing_lines_sku_time_idx (sku_id, created_at desc).

create or replace function public.enforce_pricing_promotion_budgets()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  promotion record;
  v_charged bigint;
  v_spent bigint;
  v_ended integer := 0;
begin
  for promotion in
    select *
    from public.v2_pricing_promotions
    where exhausted_at is null
      and starts_at <= now()
      -- Keep counting briefly after the end so late-recorded lines are included.
      and ends_at > now() - interval '1 hour'
    for update skip locked
  loop
    select coalesce(sum(line.charged_nanos), 0)
      into v_charged
    from public.v2_request_pricing_lines line
    where line.sku_id = any(promotion.sku_ids)
      and line.created_at >= promotion.starts_at;

    -- Charged lines are at the discounted price; convert back to list price.
    v_spent := ceil(v_charged::numeric * 10000 / (10000 - promotion.discount_bps))::bigint;

    update public.v2_pricing_promotions
    set spent_nanos = v_spent,
        checked_at = now(),
        updated_at = now()
    where promotion_id = promotion.promotion_id;

    if v_spent >= promotion.budget_nanos then
      update public.v2_pricing_skus
      set effective_to = now(),
          updated_at = now()
      where sku_id = any(promotion.sku_ids)
        and (effective_to is null or effective_to > now());

      update public.v2_pricing_promotions
      set exhausted_at = now(),
          updated_at = now()
      where promotion_id = promotion.promotion_id;

      v_ended := v_ended + 1;
    end if;
  end loop;

  return v_ended;
end;
$$;

revoke all on function public.enforce_pricing_promotion_budgets() from public, anon, authenticated;
grant execute on function public.enforce_pricing_promotion_budgets() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'enforce-pricing-promotion-budgets') then
    perform cron.unschedule('enforce-pricing-promotion-budgets');
  end if;
end
$$;

select cron.schedule('enforce-pricing-promotion-budgets', '* * * * *',
  $job$set statement_timeout = '30s'; set lock_timeout = '5s'; select public.enforce_pricing_promotion_budgets();$job$);
