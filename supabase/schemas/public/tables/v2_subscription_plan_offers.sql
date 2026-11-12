create table public.v2_subscription_plan_offers (
  offer_uuid uuid primary key default gen_random_uuid(),
  plan_uuid uuid not null references public.v2_subscription_plans(plan_uuid),
  legacy_plan_uuid uuid unique references public.v2_subscription_plans(plan_uuid),
  label text,
  billing_interval text check (billing_interval in ('day','week','month','year')),
  billing_interval_count integer not null default 1 check (billing_interval_count > 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  region_code text,
  minimum_seats integer check (minimum_seats > 0),
  tax_treatment text not null default 'unknown' check (tax_treatment in ('included','excluded','unknown')),
  eligibility text,
  purchase_url text,
  source_url text,
  verified_at timestamptz,
  effective_from timestamptz not null default '-infinity',
  effective_to timestamptz,
  metadata jsonb not null default '{}',
  check (effective_to is null or effective_to > effective_from),
  unique (offer_uuid,plan_uuid)
);
create index v2_subscription_offers_plan_idx on public.v2_subscription_plan_offers(plan_uuid);
alter table public.v2_subscription_plan_offers enable row level security;
create policy v2_subscription_plan_offers_select on public.v2_subscription_plan_offers for select to anon,authenticated using (true);
grant select on public.v2_subscription_plan_offers to anon,authenticated;
grant select,insert,update,delete on public.v2_subscription_plan_offers to service_role;
create trigger catalogue_row_history after insert or update or delete on public.v2_subscription_plan_offers for each row execute function catalogue_private.record_row_history();
create trigger catalogue_no_removal before delete or truncate on public.v2_subscription_plan_offers for each statement execute function public.prevent_catalogue_removal();
