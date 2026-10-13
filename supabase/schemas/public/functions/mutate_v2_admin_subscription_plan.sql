create function public.mutate_v2_admin_subscription_plan(p_actor_user_id uuid,p_action text,p_plan_uuid uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_before jsonb; v_plan jsonb; v_offer jsonb; v_component jsonb; v_offer_uuid uuid;
begin
  if p_action not in ('create','update') then raise exception 'Unsupported subscription action'; end if;
  select to_jsonb(p) into v_before from v2_subscription_plans p where p.plan_uuid=p_plan_uuid for update;
  if p_action='create' and v_before is not null then raise exception 'Plan already exists'; end if;
  if p_action='update' and v_before is null then raise exception 'Plan does not exist'; end if;
  v_plan:=public.mutate_v2_admin_registry(p_actor_user_id,'plans',jsonb_build_object('plan_uuid',p_plan_uuid,
    'plan_id',p_payload->>'plan_id','name',p_payload->>'name','lab_slug',p_payload->>'organisation_id',
    'description',p_payload->>'description','link',p_payload->>'link',
    'audience',coalesce(p_payload->>'audience','unknown'),'status',coalesce(p_payload->>'status','active'),
    'other_info',coalesce(p_payload->'other_info','{}'::jsonb)),v_before);
  if p_payload ? 'offer' and p_payload->'offer'<>'null'::jsonb then
    v_offer_uuid:=coalesce((p_payload->'offer'->>'offer_uuid')::uuid,gen_random_uuid());
    select to_jsonb(o) into v_before from v2_subscription_plan_offers o where o.offer_uuid=v_offer_uuid for update;
    if v_before is not null and (v_before->>'plan_uuid')::uuid<>p_plan_uuid then raise exception 'Offer belongs to another plan'; end if;
    v_offer:=public.mutate_v2_admin_registry(p_actor_user_id,'plan-offers',
      ((p_payload->'offer')-'components')||jsonb_build_object('offer_uuid',v_offer_uuid,'plan_uuid',p_plan_uuid),v_before);
    for v_component in select value from jsonb_array_elements(coalesce(p_payload->'offer'->'components','[]')) loop
      v_component:=v_component||jsonb_build_object('offer_uuid',v_offer_uuid,'price_uuid',coalesce(v_component->>'price_uuid',gen_random_uuid()::text));
      select to_jsonb(c) into v_before from v2_subscription_offer_prices c where c.price_uuid=(v_component->>'price_uuid')::uuid for update;
      if v_before is not null and (v_before->>'offer_uuid')::uuid<>v_offer_uuid then raise exception 'Price belongs to another offer'; end if;
      perform public.mutate_v2_admin_registry(p_actor_user_id,'offer-prices',v_component,v_before);
    end loop;
  end if;
  return v_plan;
end $$;
revoke all on function public.mutate_v2_admin_subscription_plan(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_subscription_plan(uuid,text,uuid,jsonb) to service_role;
