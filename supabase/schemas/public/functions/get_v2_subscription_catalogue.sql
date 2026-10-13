create function public.get_v2_subscription_catalogue(p_plan_id text default null,p_model_slug text default null,p_include_hidden boolean default false)
returns setof jsonb language sql stable security invoker set search_path=public,pg_temp as $$
select to_jsonb(p)-'price'-'currency'-'frequency' || jsonb_build_object(
  'organisation_id',p.lab_slug,
  'organisation',case when l.lab_slug is null then null else jsonb_build_object('organisation_id',l.lab_slug,'name',l.name,'colour',l.metadata->>'colour') end,
  'offers',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('components',coalesce((select jsonb_agg(to_jsonb(c) order by c.starts_at_cycle,c.component_key)
    from v2_subscription_offer_prices c where c.offer_uuid=o.offer_uuid and c.effective_from<=now() and (c.effective_to is null or c.effective_to>now())),'[]'::jsonb)) order by o.billing_interval,o.billing_interval_count,o.offer_uuid)
    from v2_subscription_plan_offers o where o.plan_uuid=p.plan_uuid and o.effective_from<=now() and (o.effective_to is null or o.effective_to>now())),'[]'::jsonb),
  'features',coalesce((select jsonb_agg(to_jsonb(f) order by f.feature_name) from v2_subscription_plan_features f where f.plan_uuid=p.plan_uuid and f.effective_from<=now() and (f.effective_to is null or f.effective_to>now())),'[]'::jsonb),
  'allowances',coalesce((select jsonb_agg(to_jsonb(a) order by a.allowance_key) from v2_subscription_plan_allowances a where a.plan_uuid=p.plan_uuid and a.effective_from<=now() and (a.effective_to is null or a.effective_to>now()) and (a.offer_uuid is null or exists(select 1 from v2_subscription_plan_offers o where o.offer_uuid=a.offer_uuid and o.effective_from<=now() and (o.effective_to is null or o.effective_to>now())))),'[]'::jsonb),
  'models',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('model_id',m.model_slug,'model',jsonb_build_object('model_id',v.model_slug,'name',v.name,'organisation_id',v.lab_slug,'organisation_name',ml.name)) order by m.model_slug)
    from v2_subscription_plan_models m join v2_models v on v.model_slug=m.model_slug left join v2_labs ml on ml.lab_slug=v.lab_slug
    where m.plan_uuid=p.plan_uuid and (not v.hidden or p_include_hidden) and m.effective_from<=now() and (m.effective_to is null or m.effective_to>now())),'[]'::jsonb))
from v2_subscription_plans p left join v2_labs l on l.lab_slug=p.lab_slug
where p.status='active' and p.effective_from<=now() and (p.effective_to is null or p.effective_to>now())
  and (not p_include_hidden or current_user in ('postgres','service_role'))
  and (p_plan_id is null or p.plan_id=p_plan_id)
  and (p_model_slug is null or exists(select 1 from v2_subscription_plan_models m join v2_models v on v.model_slug=m.model_slug
    where m.plan_uuid=p.plan_uuid and m.model_slug=p_model_slug and (not v.hidden or p_include_hidden) and m.effective_from<=now() and (m.effective_to is null or m.effective_to>now())))
order by p.name,p.plan_id;
$$;
revoke all on function public.get_v2_subscription_catalogue(text,text,boolean) from public;
grant execute on function public.get_v2_subscription_catalogue(text,text,boolean) to anon,authenticated,service_role;
