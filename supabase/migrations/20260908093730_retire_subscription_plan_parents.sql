set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.v2_subscription_plans add column effective_to timestamptz;
comment on column public.v2_subscription_plans.effective_to is 'End of active catalogue visibility; retained for catalogue history.';

alter policy v2_subscription_plans_public_select on public.v2_subscription_plans
  using (effective_to is null or effective_to > now());

create or replace function public.get_v2_model_subscription_plans(p_model_slug text)
returns table (
  plan_uuid uuid, plan_id text, name text, lab_slug text, description text, link text,
  other_info jsonb, created_at timestamptz, updated_at timestamptz, model_info jsonb,
  rate_limit jsonb, model_other_info jsonb, price numeric, currency text, frequency text
)
language sql stable security invoker set search_path = public
as $$
  select plan.plan_uuid, plan.plan_id, plan.name, plan.lab_slug, plan.description, plan.link,
    plan.other_info, plan.created_at, plan.updated_at, relation.model_info,
    relation.rate_limit, relation.other_info, plan.price, plan.currency, plan.frequency
  from public.v2_subscription_plan_models relation
  join public.v2_subscription_plans plan on plan.plan_uuid = relation.plan_uuid
  where relation.model_slug = lower(trim(p_model_slug))
    and (relation.effective_to is null or relation.effective_to > now())
    and (plan.effective_to is null or plan.effective_to > now())
  order by plan.plan_id, plan.frequency;
$$;
