create table if not exists public.v2_subscription_plans (
  plan_uuid uuid primary key,
  plan_id text not null,
  name text not null,
  lab_slug text,
  description text,
  frequency text,
  price numeric,
  currency text,
  link text,
  other_info jsonb not null default '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz
);

create table if not exists public.v2_subscription_plan_models (
  plan_uuid uuid not null references public.v2_subscription_plans(plan_uuid) on delete cascade,
  model_slug text not null references public.v2_models(model_slug) on delete cascade,
  model_info jsonb not null default '{}'::jsonb,
  rate_limit jsonb not null default '{}'::jsonb,
  other_info jsonb not null default '{}'::jsonb,
  primary key (plan_uuid, model_slug)
);

create table if not exists public.v2_subscription_plan_features (
  plan_uuid uuid not null references public.v2_subscription_plans(plan_uuid) on delete cascade,
  feature_name text not null,
  feature_value text,
  feature_description text,
  other_info jsonb not null default '{}'::jsonb,
  primary key (plan_uuid, feature_name)
);

create index if not exists v2_subscription_plan_models_model_idx on public.v2_subscription_plan_models(model_slug, plan_uuid);

insert into public.v2_subscription_plans (plan_uuid, plan_id, name, lab_slug, description, frequency, price, currency, link, other_info, created_at, updated_at)
select plan_uuid, plan_id, name, organisation_id, description, frequency, price, currency, link, coalesce(other_info, '{}'::jsonb), created_at::timestamptz, updated_at::timestamptz
from public.data_subscription_plans
on conflict (plan_uuid) do update set plan_id = excluded.plan_id, name = excluded.name, lab_slug = excluded.lab_slug,
  description = excluded.description, frequency = excluded.frequency, price = excluded.price, currency = excluded.currency,
  link = excluded.link, other_info = excluded.other_info, updated_at = excluded.updated_at;

insert into public.v2_subscription_plan_models (plan_uuid, model_slug, model_info, rate_limit, other_info)
select relation.plan_uuid, relation.model_id, coalesce(relation.model_info, '{}'::jsonb), coalesce(relation.rate_limit, '{}'::jsonb), coalesce(relation.other_info, '{}'::jsonb)
from public.data_subscription_plan_models relation
join public.v2_subscription_plans plan on plan.plan_uuid = relation.plan_uuid
join public.v2_models model on model.model_slug = relation.model_id
on conflict (plan_uuid, model_slug) do update set model_info = excluded.model_info, rate_limit = excluded.rate_limit, other_info = excluded.other_info;

insert into public.v2_subscription_plan_features (plan_uuid, feature_name, feature_value, feature_description, other_info)
select feature.plan_uuid, feature.feature_name, feature.feature_value, feature.feature_description, coalesce(feature.other_info, '{}'::jsonb)
from public.data_subscription_plan_features feature
join public.v2_subscription_plans plan on plan.plan_uuid = feature.plan_uuid
on conflict (plan_uuid, feature_name) do update set feature_value = excluded.feature_value, feature_description = excluded.feature_description, other_info = excluded.other_info;

alter table public.v2_subscription_plans enable row level security;
alter table public.v2_subscription_plan_models enable row level security;
alter table public.v2_subscription_plan_features enable row level security;
drop policy if exists v2_subscription_plans_public_select on public.v2_subscription_plans;
create policy v2_subscription_plans_public_select on public.v2_subscription_plans for select to anon, authenticated using (true);
drop policy if exists v2_subscription_plan_models_public_select on public.v2_subscription_plan_models;
create policy v2_subscription_plan_models_public_select on public.v2_subscription_plan_models for select to anon, authenticated using (true);
drop policy if exists v2_subscription_plan_features_public_select on public.v2_subscription_plan_features;
create policy v2_subscription_plan_features_public_select on public.v2_subscription_plan_features for select to anon, authenticated using (true);
grant select on public.v2_subscription_plans, public.v2_subscription_plan_models, public.v2_subscription_plan_features to anon, authenticated;
grant insert, update, delete on public.v2_subscription_plans, public.v2_subscription_plan_models, public.v2_subscription_plan_features to service_role;

create or replace function public.get_v2_model_subscription_plans(p_model_slug text)
returns table (
  plan_uuid uuid, plan_id text, name text, lab_slug text, description text, link text, other_info jsonb,
  created_at timestamptz, updated_at timestamptz, model_info jsonb, rate_limit jsonb, model_other_info jsonb,
  price numeric, currency text, frequency text
)
language sql stable security invoker set search_path = public
as $$
  select plan.plan_uuid, plan.plan_id, plan.name, plan.lab_slug, plan.description, plan.link, plan.other_info,
    plan.created_at, plan.updated_at, relation.model_info, relation.rate_limit, relation.other_info,
    plan.price, plan.currency, plan.frequency
  from public.v2_subscription_plan_models relation
  join public.v2_subscription_plans plan on plan.plan_uuid = relation.plan_uuid
  where relation.model_slug = lower(trim(p_model_slug))
  order by plan.plan_id, plan.frequency;
$$;
grant execute on function public.get_v2_model_subscription_plans(text) to anon, authenticated, service_role;
