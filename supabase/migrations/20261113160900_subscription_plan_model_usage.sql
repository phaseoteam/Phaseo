-- phaseo:allow-destructive-migration reason: Adds the catalogue DELETE/TRUNCATE guard trigger to a new table; no rows are removed.
-- Measured monthly token volume per subscription plan and model, imported from public measurement datasets.
-- Lets the catalogue show what a model effectively costs per 1M tokens on a subscription and how that compares with API prices.

SET local check_function_bodies = off;

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

CREATE OR REPLACE FUNCTION public.get_v2_subscription_model_usage (
  p_model_slug text DEFAULT NULL
)
  RETURNS TABLE (
    model_slug                  text,
    plan_uuid                   uuid,
    plan_id                     text,
    plan_name                   text,
    lab_slug                    text,
    scenario                    text,
    monthly_price_usd           numeric,
    monthly_tokens              numeric,
    effective_usd_per_mtok      numeric,
    api_equivalent_usd_per_mtok numeric,
    share_of_api_price          numeric,
    workload                    text,
    basis                       text,
    confidence                  text,
    source_name                 text,
    source_url                  text,
    measured_on                 text,
    promo_until                 date
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with usage as (
    select u.*, plan.plan_id, plan.name as plan_name, plan.lab_slug,
      coalesce(case when plan.frequency = 'monthly' and plan.currency = 'USD' then plan.price end, u.plan_price_usd) as monthly_price_usd
    from public.v2_subscription_plan_model_usage u
    join public.v2_subscription_plans plan on plan.plan_uuid = u.plan_uuid
    where u.effective_to is null
      and (p_model_slug is null or u.model_slug = lower(trim(p_model_slug)))
  )
  select usage.model_slug, usage.plan_uuid, usage.plan_id, usage.plan_name, usage.lab_slug, usage.scenario,
    usage.monthly_price_usd, usage.monthly_tokens,
    round(usage.monthly_price_usd / (usage.monthly_tokens / 1000000), 6),
    usage.api_equivalent_usd_per_mtok,
    round(usage.monthly_price_usd / (usage.monthly_tokens / 1000000) / usage.api_equivalent_usd_per_mtok, 6),
    usage.workload, usage.basis, usage.confidence, usage.source_name, usage.source_url, usage.measured_on, usage.promo_until
  from usage
  order by usage.model_slug, usage.monthly_price_usd nulls last, usage.plan_id, usage.scenario
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_model_usage"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_model_usage"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_subscription_model_usage"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_model_usage"(text) TO "postgres";
