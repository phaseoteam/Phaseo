create or replace function public.replace_subscription_plan_bundle(
  p_plan jsonb,
  p_models jsonb default '[]'::jsonb,
  p_features jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_uuid uuid;
  v_models jsonb := coalesce(p_models, '[]'::jsonb);
  v_features jsonb := coalesce(p_features, '[]'::jsonb);
begin
  if p_plan is null then
    raise exception 'p_plan is required';
  end if;

  if jsonb_typeof(v_models) <> 'array' then
    raise exception 'p_models must be a JSON array';
  end if;

  if jsonb_typeof(v_features) <> 'array' then
    raise exception 'p_features must be a JSON array';
  end if;

  select plan_uuid
  into v_plan_uuid
  from jsonb_to_record(p_plan) as plan(
    plan_uuid uuid,
    plan_id text,
    name text,
    organisation_id text,
    description text,
    frequency text,
    price numeric,
    currency text,
    link text,
    other_info jsonb
  );

  if v_plan_uuid is null then
    raise exception 'p_plan.plan_uuid is required';
  end if;

  insert into public.data_subscription_plans (
    plan_uuid,
    plan_id,
    name,
    organisation_id,
    description,
    frequency,
    price,
    currency,
    link,
    other_info
  )
  select
    plan_uuid,
    plan_id,
    name,
    organisation_id,
    description,
    frequency,
    price,
    currency,
    link,
    coalesce(other_info, '{}'::jsonb)
  from jsonb_to_record(p_plan) as plan(
    plan_uuid uuid,
    plan_id text,
    name text,
    organisation_id text,
    description text,
    frequency text,
    price numeric,
    currency text,
    link text,
    other_info jsonb
  )
  on conflict (plan_uuid) do update
  set
    plan_id = excluded.plan_id,
    name = excluded.name,
    organisation_id = excluded.organisation_id,
    description = excluded.description,
    frequency = excluded.frequency,
    price = excluded.price,
    currency = excluded.currency,
    link = excluded.link,
    other_info = excluded.other_info;

  delete from public.data_subscription_plan_models
  where plan_uuid = v_plan_uuid;

  insert into public.data_subscription_plan_models (
    plan_uuid,
    model_id,
    model_info,
    rate_limit,
    other_info
  )
  select
    v_plan_uuid,
    model_id,
    coalesce(model_info, '{}'::jsonb),
    coalesce(rate_limit, '{}'::jsonb),
    coalesce(other_info, '{}'::jsonb)
  from jsonb_to_recordset(v_models) as model(
    plan_uuid uuid,
    model_id text,
    model_info jsonb,
    rate_limit jsonb,
    other_info jsonb
  );

  delete from public.data_subscription_plan_features
  where plan_uuid = v_plan_uuid;

  insert into public.data_subscription_plan_features (
    plan_uuid,
    feature_name,
    feature_value,
    feature_description,
    other_info
  )
  select
    v_plan_uuid,
    feature_name,
    feature_value,
    feature_description,
    coalesce(other_info, '{}'::jsonb)
  from jsonb_to_recordset(v_features) as feature(
    plan_uuid uuid,
    feature_name text,
    feature_value jsonb,
    feature_description text,
    other_info jsonb
  );
end;
$$;
revoke all on function public.replace_subscription_plan_bundle(jsonb, jsonb, jsonb) from public;
grant execute on function public.replace_subscription_plan_bundle(jsonb, jsonb, jsonb) to service_role;
