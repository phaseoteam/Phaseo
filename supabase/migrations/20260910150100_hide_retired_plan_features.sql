drop policy if exists v2_subscription_plan_features_public_select on public.v2_subscription_plan_features;
create policy v2_subscription_plan_features_public_select
on public.v2_subscription_plan_features
for select
to anon, authenticated
using (
  (effective_to is null or effective_to > now())
  and exists (
    select 1
    from public.v2_subscription_plans plan
    where plan.plan_uuid = v2_subscription_plan_features.plan_uuid
      and (plan.effective_to is null or plan.effective_to > now())
  )
);
