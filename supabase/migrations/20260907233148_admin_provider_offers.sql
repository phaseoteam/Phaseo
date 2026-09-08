-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

-- Create and maintain provider offers independently of model pricing.
create function public.mutate_v2_admin_provider_offer(p_actor_user_id uuid, p_action text, p_provider_slug text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_before jsonb; v_after jsonb; v_family text; v_parent text; v_scope text; v_mode text; v_field text;
  v_exec text[]; v_data text[]; v_metadata jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  if p_action not in ('create','update') then raise exception 'unsupported provider action'; end if;
  if nullif(trim(p_payload->>'api_provider_name'),'') is null then raise exception 'provider name required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-offer:'||p_provider_slug,0));
  select to_jsonb(p) into v_before from public.v2_providers p where provider_slug=p_provider_slug for update;
  if p_action='create' and v_before is not null then raise exception 'provider already exists'; end if;
  if p_action='update' and v_before is null then raise exception 'provider not found'; end if;
  v_scope=coalesce(p_payload->>'offer_scope',v_before->>'offer_scope','global');
  v_mode=coalesce(p_payload->>'residency_mode',v_before->>'residency_mode','unknown');
  if v_scope not in ('global','regional','specialized') then raise exception 'invalid offer scope'; end if;
  if v_mode not in ('unknown','provider_managed','customer_selectable','account_selected') then raise exception 'invalid residency mode'; end if;
  v_parent=nullif(trim(p_payload->>'parent_provider_slug'),'');
  v_family=coalesce(v_before->>'provider_family_slug',p_provider_slug);
  if v_parent is not null then
    if v_parent=p_provider_slug then raise exception 'provider cannot be its own parent'; end if;
    select coalesce(provider_family_slug,provider_slug) into v_family from public.v2_providers where provider_slug=v_parent;
    if not found then raise exception 'parent provider not found'; end if;
  elsif p_action='create' and v_scope='regional' then raise exception 'regional offers require a parent provider';
  end if;
  foreach v_field in array array['default_execution_regions','default_data_regions'] loop
    if p_payload ? v_field then
      if jsonb_typeof(p_payload->v_field) not in ('array','null') then raise exception 'invalid region list'; end if;
      if jsonb_typeof(p_payload->v_field)='array' and exists(select 1 from jsonb_array_elements(p_payload->v_field) x where jsonb_typeof(x)<>'string' or trim(x#>>'{}') !~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$') then raise exception 'invalid region'; end if;
    end if;
  end loop;
  v_exec=case when jsonb_typeof(coalesce(p_payload->'default_execution_regions',v_before->'default_execution_regions'))='array' then array(select distinct lower(trim(value)) from jsonb_array_elements_text(coalesce(p_payload->'default_execution_regions',v_before->'default_execution_regions'))) else null end;
  v_data=case when jsonb_typeof(coalesce(p_payload->'default_data_regions',v_before->'default_data_regions'))='array' then array(select distinct lower(trim(value)) from jsonb_array_elements_text(coalesce(p_payload->'default_data_regions',v_before->'default_data_regions'))) else null end;
  if v_scope='regional' and (coalesce(cardinality(v_exec),0)=0 or 'global'=any(v_exec)) then raise exception 'regional offers require specific execution regions'; end if;
  if v_scope='regional' and nullif(trim(coalesce(p_payload->>'offer_label',v_before->>'offer_label')),'') is null then raise exception 'regional offer label required'; end if;
  v_metadata=coalesce(v_before->'metadata','{}'::jsonb);
  foreach v_field in array array['description','link','prompt_training_policy','prompt_training_notes','prompt_training_source_url','data_policy_tier','data_policy_confidence','data_policy_contract_mode','data_policy_contract_notes'] loop
    if p_payload ? v_field then v_metadata=v_metadata||jsonb_build_object(v_field,p_payload->v_field); end if;
  end loop;
  if p_payload ? 'parent_provider_slug' then v_metadata=v_metadata||jsonb_build_object('parent_provider_slug',v_parent); end if;
  perform set_config('phaseo.catalogue_actor',p_actor_user_id::text,true);
  insert into public.v2_providers(provider_slug,name,provider_family_slug,offer_scope,offer_label,residency_mode,default_execution_regions,default_data_regions,country_code,base_url,byok_available,status,routing_enabled,routable,metadata,updated_at)
  values(p_provider_slug,trim(p_payload->>'api_provider_name'),v_family,v_scope,
    case when p_payload ? 'offer_label' then nullif(trim(p_payload->>'offer_label'),'') else v_before->>'offer_label' end,
    v_mode,v_exec,v_data,coalesce(nullif(p_payload->>'country_code',''),v_before->>'country_code','xx'),
    case when p_payload ? 'base_url' then nullif(trim(p_payload->>'base_url'),'') else v_before->>'base_url' end,
    coalesce((p_payload->>'byok_available')::boolean,(v_before->>'byok_available')::boolean,false),
    lower(coalesce(p_payload->>'status',v_before->>'status','active')),false,false,v_metadata,now())
  on conflict(provider_slug) do update set name=excluded.name,provider_family_slug=excluded.provider_family_slug,offer_scope=excluded.offer_scope,offer_label=excluded.offer_label,residency_mode=excluded.residency_mode,default_execution_regions=excluded.default_execution_regions,default_data_regions=excluded.default_data_regions,country_code=excluded.country_code,base_url=excluded.base_url,byok_available=excluded.byok_available,status=excluded.status,metadata=excluded.metadata,updated_at=now();
  select to_jsonb(p) into v_after from public.v2_providers p where provider_slug=p_provider_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state) values(p_actor_user_id,'providers',p_provider_slug,p_action,v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at) values('providers',p_provider_slug,'database_managed',p_actor_user_id,p_provider_slug,now()) on conflict(source_type,source_key) do update set disposition=excluded.disposition,actor_user_id=excluded.actor_user_id,updated_at=now();
  return v_after;
end $$;
revoke all on function public.mutate_v2_admin_provider_offer(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_provider_offer(uuid,text,text,jsonb) to service_role;

