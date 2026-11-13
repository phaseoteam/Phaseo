create table public.v2_subscription_plan_model_usage (
  usage_uuid uuid primary key default gen_random_uuid(),
  plan_uuid uuid not null references public.v2_subscription_plans(plan_uuid),
  model_slug text not null references public.v2_models(model_slug),
  scenario text not null default 'standard' check (scenario in ('standard','peak','off_peak','fast')),
  monthly_tokens numeric not null check (monthly_tokens > 0),
  workload text not null default 'unknown' check (workload in ('measured','standard_mix','unknown')),
  basis text not null default 'unknown' check (basis in ('measured','derived','official','assumed','unknown')),
  confidence text not null check (confidence in ('high','medium','low','assumed')),
  plan_price_usd numeric check (plan_price_usd >= 0),
  api_equivalent_usd_per_mtok numeric check (api_equivalent_usd_per_mtok > 0),
  source_name text not null,
  source_record_id text,
  source_url text,
  note text,
  measured_on text,
  promo_until date,
  verified_at timestamptz,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  metadata jsonb not null default '{}',
  check (effective_to is null or effective_to > effective_from)
);
create unique index v2_subscription_model_usage_current_idx on public.v2_subscription_plan_model_usage(plan_uuid, model_slug, scenario, source_name) where effective_to is null;
create index v2_subscription_model_usage_model_idx on public.v2_subscription_plan_model_usage(model_slug);
alter table public.v2_subscription_plan_model_usage enable row level security;
create policy v2_subscription_plan_model_usage_select on public.v2_subscription_plan_model_usage for select to anon,authenticated using (effective_to is null or effective_to > now());
create policy provider_catalog_public_guard on public.v2_subscription_plan_model_usage as restrictive for select to anon,authenticated using (public.catalog_model_is_public(model_slug));
grant select on public.v2_subscription_plan_model_usage to anon,authenticated;
grant select,insert,update,delete on public.v2_subscription_plan_model_usage to service_role;
create trigger catalogue_row_history after insert or update or delete on public.v2_subscription_plan_model_usage for each row execute function catalogue_private.record_row_history();
create trigger catalogue_no_removal before delete or truncate on public.v2_subscription_plan_model_usage for each statement execute function public.prevent_catalogue_removal();
