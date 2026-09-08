-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

-- Provider-offer policy used by gateway residency filtering. No endpoints or credentials are changed.
create function public.mutate_v2_admin_provider_residency(p_actor_user_id uuid, p_provider_slug text, p_policy jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_before jsonb; v_after jsonb; v_field text;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  if p_policy->>'residency_mode' is null or p_policy->>'residency_mode' not in ('unknown','provider_managed','customer_selectable','account_selected') then raise exception 'invalid residency mode'; end if;
  foreach v_field in array array['default_execution_regions','default_data_regions'] loop
    if not (p_policy ? v_field) or jsonb_typeof(p_policy->v_field) not in ('array','null') then raise exception 'region list required'; end if;
    if jsonb_typeof(p_policy->v_field)='array' then
      if jsonb_array_length(p_policy->v_field)>100 or exists(select 1 from jsonb_array_elements(p_policy->v_field) x where jsonb_typeof(x)<>'string' or trim(x#>>'{}') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$') then raise exception 'invalid region'; end if;
    end if;
  end loop;
  select to_jsonb(p) into v_before from public.v2_providers p where provider_slug=p_provider_slug for update;
  if v_before is null then raise exception 'provider not found'; end if;
  perform set_config('phaseo.catalogue_actor',p_actor_user_id::text,true);
  update public.v2_providers set
    residency_mode=p_policy->>'residency_mode',
    default_execution_regions=case when jsonb_typeof(p_policy->'default_execution_regions')='array' then array(select distinct lower(trim(value)) from jsonb_array_elements_text(p_policy->'default_execution_regions')) else null end,
    default_data_regions=case when jsonb_typeof(p_policy->'default_data_regions')='array' then array(select distinct lower(trim(value)) from jsonb_array_elements_text(p_policy->'default_data_regions')) else null end,
    updated_at=now() where provider_slug=p_provider_slug;
  select to_jsonb(p) into v_after from public.v2_providers p where provider_slug=p_provider_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state) values(p_actor_user_id,'providers',p_provider_slug,'update',v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at) values('providers',p_provider_slug,'database_managed',p_actor_user_id,p_provider_slug,now()) on conflict(source_type,source_key) do update set disposition=excluded.disposition,actor_user_id=excluded.actor_user_id,updated_at=now();
  return v_after;
end $$;
revoke all on function public.mutate_v2_admin_provider_residency(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_provider_residency(uuid,text,jsonb) to service_role;
