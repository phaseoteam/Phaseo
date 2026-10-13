create function public.canonicalize_subscription_identity() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$ begin
  if tg_table_name='v2_subscription_plans' then
    new.canonical_plan_uuid:=coalesce(new.canonical_plan_uuid,new.plan_uuid);
  else
    select coalesce(canonical_plan_uuid,plan_uuid) into new.plan_uuid from v2_subscription_plans where plan_uuid=new.plan_uuid;
  end if;
  return new;
end $$;
revoke all on function public.canonicalize_subscription_identity() from public,anon,authenticated;
grant execute on function public.canonicalize_subscription_identity() to service_role;
