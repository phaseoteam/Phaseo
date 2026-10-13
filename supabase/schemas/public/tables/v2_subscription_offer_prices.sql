create table public.v2_subscription_offer_prices (
  price_uuid uuid primary key default gen_random_uuid(),
  offer_uuid uuid not null references public.v2_subscription_plan_offers(offer_uuid),
  component_key text not null,
  pricing_type text not null check (pricing_type in ('free','fixed','starting_at','custom','usage_based','unknown')),
  amount numeric,
  charge_basis text not null default 'account' check (charge_basis in ('account','seat','unit')),
  seat_type text,
  unit text,
  unit_quantity numeric not null default 1 check (unit_quantity > 0),
  phase text not null default 'standard' check (phase in ('standard','introductory','renewal')),
  starts_at_cycle integer not null default 1 check (starts_at_cycle > 0),
  duration_cycles integer check (duration_cycles > 0),
  display_text text,
  source_url text,
  verified_at timestamptz,
  effective_from timestamptz not null default '-infinity',
  effective_to timestamptz,
  check (effective_to is null or effective_to > effective_from),
  check ((pricing_type='free' and amount=0) or
    (pricing_type in ('fixed','starting_at') and amount is not null and amount >= 0) or
    (pricing_type in ('custom','unknown') and amount is null) or
    (pricing_type='usage_based' and (amount is null or amount >= 0))),
  check (charge_basis <> 'unit' or unit is not null),
  unique (offer_uuid,component_key,phase,starts_at_cycle,effective_from)
);

alter table public.v2_subscription_offer_prices enable row level security;
create policy v2_subscription_offer_prices_select on public.v2_subscription_offer_prices for select to anon,authenticated using (true);
grant select on public.v2_subscription_offer_prices to anon,authenticated;
grant select,insert,update,delete on public.v2_subscription_offer_prices to service_role;
create trigger catalogue_row_history after insert or update or delete on public.v2_subscription_offer_prices for each row execute function catalogue_private.record_row_history();
create trigger catalogue_no_removal before delete or truncate on public.v2_subscription_offer_prices for each statement execute function public.prevent_catalogue_removal();
