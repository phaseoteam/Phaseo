create table public.v2_subscription_plan_allowances (
  allowance_uuid uuid primary key default gen_random_uuid(),
  plan_uuid uuid not null references public.v2_subscription_plans(plan_uuid),
  offer_uuid uuid,
  feature_key text not null references public.v2_subscription_feature_definitions(feature_key),
  allowance_key text not null,
  allowance_kind text not null default 'quota' check (allowance_kind in ('quota','credit_grant','concurrency','relative_usage')),
  quantity numeric check (quantity >= 0),
  quantity_max numeric,
  quantity_kind text not null default 'unknown' check (quantity_kind in ('exact','up_to','approximate','estimated','unlimited','unknown','custom')),
  unit text not null,
  currency text check (currency ~ '^[A-Z]{3}$'),
  window_kind text not null default 'none' check (window_kind in ('calendar','rolling','none','unknown')),
  window_unit text check (window_unit in ('minute','hour','day','week','month','year')),
  window_count integer check (window_count > 0),
  allocation_basis text not null default 'unknown' check (allocation_basis in ('account','seat','workspace','unknown')),
  pool_scope text not null default 'unknown' check (pool_scope in ('account','workspace','organisation','payer_account','unknown')),
  pool_key text,
  grant_condition text,
  comparison_plan_uuid uuid references public.v2_subscription_plans(plan_uuid),
  comparison_feature_key text references public.v2_subscription_feature_definitions(feature_key),
  overage_policy text not null default 'unknown' check (overage_policy in ('blocked','payg','throttled','unknown')),
  overage_price numeric check (overage_price >= 0),
  overage_currency text check (overage_currency ~ '^[A-Z]{3}$'),
  overage_unit_quantity numeric check (overage_unit_quantity > 0),
  overage_source_url text,
  conditions text,
  display_text text,
  source_url text,
  verified_at timestamptz,
  effective_from timestamptz not null default '-infinity',
  effective_to timestamptz,
  metadata jsonb not null default '{}',
  foreign key (offer_uuid,plan_uuid) references public.v2_subscription_plan_offers(offer_uuid,plan_uuid),
  check (quantity_max is null or (quantity is not null and quantity_max >= quantity)),
  check (quantity_kind not in ('exact','up_to','approximate','estimated') or quantity is not null),
  check (quantity_kind <> 'unlimited' or (quantity is null and quantity_max is null)),
  check ((window_kind in ('calendar','rolling') and window_unit is not null and window_count is not null) or
    (window_kind in ('none','unknown') and window_unit is null and window_count is null)),
  check (overage_price is null or (overage_policy='payg' and overage_currency is not null and overage_unit_quantity is not null)),
  check (effective_to is null or effective_to > effective_from)
);
create index v2_subscription_allowances_plan_idx on public.v2_subscription_plan_allowances(plan_uuid);
create index v2_subscription_allowances_offer_idx on public.v2_subscription_plan_allowances(offer_uuid);
create index v2_subscription_allowances_feature_idx on public.v2_subscription_plan_allowances(feature_key);
create index v2_subscription_allowances_comparison_idx on public.v2_subscription_plan_allowances(comparison_plan_uuid);
alter table public.v2_subscription_plan_allowances enable row level security;
create policy v2_subscription_plan_allowances_select on public.v2_subscription_plan_allowances for select to anon,authenticated using (true);
grant select on public.v2_subscription_plan_allowances to anon,authenticated;
grant select,insert,update,delete on public.v2_subscription_plan_allowances to service_role;
create trigger catalogue_row_history after insert or update or delete on public.v2_subscription_plan_allowances for each row execute function catalogue_private.record_row_history();
create trigger catalogue_no_removal before delete or truncate on public.v2_subscription_plan_allowances for each statement execute function public.prevent_catalogue_removal();
