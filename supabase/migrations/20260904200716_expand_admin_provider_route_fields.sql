-- phaseo:allow-destructive-migration reason: Admin notice removal and complete alias replacement require model-scoped deletes, both captured in the catalogue audit trail.
create or replace function public.mutate_v2_admin_provider_route(
  p_actor_user_id uuid,
  p_model_slug text,
  p_route jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_provider_slug text := nullif(trim(p_route->>'provider_slug'),'');
  v_provider_model_slug text := nullif(trim(p_route->>'provider_model_slug'),'');
  v_provider_model_id text := nullif(trim(p_route->>'provider_model_id'),'');
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  if not exists(select 1 from public.v2_models where model_slug=p_model_slug) then raise exception 'model not found'; end if;
  if v_provider_slug is null or not exists(select 1 from public.v2_providers where provider_slug=v_provider_slug) then raise exception 'provider not found'; end if;
  if v_provider_model_slug is null then raise exception 'provider_model_slug is required'; end if;
  if v_provider_model_id is null then v_provider_model_id := v_provider_slug||':'||p_model_slug||':'||v_provider_model_slug; end if;
  select to_jsonb(t) into v_before from public.v2_model_provider_routes t where provider_model_id=v_provider_model_id;
  insert into public.v2_model_provider_routes(
    provider_model_id,model_slug,provider_slug,provider_model_slug,status,
    provider_availability_status,phaseo_status,access_scope,routing_enabled,
    input_modalities,output_modalities,regions,context_length,max_output_tokens,
    effective_from,effective_to,metadata,updated_at
  ) values (
    v_provider_model_id,p_model_slug,v_provider_slug,v_provider_model_slug,
    coalesce(nullif(p_route->>'status',''),'active'),
    coalesce(nullif(p_route->>'provider_availability_status',''),'unknown'),
    coalesce(nullif(p_route->>'phaseo_status',''),'disabled'),
    coalesce(nullif(p_route->>'access_scope',''),'public'),
    coalesce((p_route->>'routing_enabled')::boolean,false),
    case when jsonb_typeof(p_route->'input_modalities')='array' then array(select jsonb_array_elements_text(p_route->'input_modalities')) else '{}'::text[] end,
    case when jsonb_typeof(p_route->'output_modalities')='array' then array(select jsonb_array_elements_text(p_route->'output_modalities')) else '{}'::text[] end,
    case when jsonb_typeof(p_route->'regions')='array' then array(select jsonb_array_elements_text(p_route->'regions')) else '{}'::text[] end,
    nullif(p_route->>'context_length','')::integer,nullif(p_route->>'max_output_tokens','')::integer,
    nullif(p_route->>'effective_from','')::timestamptz,nullif(p_route->>'effective_to','')::timestamptz,
    coalesce(p_route->'metadata','{}'::jsonb)||jsonb_build_object('source','admin'),now()
  ) on conflict(provider_model_id) do update set
    provider_slug=excluded.provider_slug,provider_model_slug=excluded.provider_model_slug,status=excluded.status,
    provider_availability_status=case when p_route ? 'provider_availability_status' then excluded.provider_availability_status else public.v2_model_provider_routes.provider_availability_status end,
    phaseo_status=case when p_route ? 'phaseo_status' then excluded.phaseo_status else public.v2_model_provider_routes.phaseo_status end,
    access_scope=case when p_route ? 'access_scope' then excluded.access_scope else public.v2_model_provider_routes.access_scope end,
    routing_enabled=excluded.routing_enabled,
    input_modalities=excluded.input_modalities,output_modalities=excluded.output_modalities,
    regions=excluded.regions,context_length=excluded.context_length,max_output_tokens=excluded.max_output_tokens,
    effective_from=excluded.effective_from,effective_to=excluded.effective_to,
    metadata=public.v2_model_provider_routes.metadata||excluded.metadata,updated_at=now();
  if exists(
    select 1 from public.v2_model_provider_routes t
    where t.provider_model_id=v_provider_model_id and t.routing_enabled
      and (t.phaseo_status <> 'enabled' or t.access_scope <> 'public'
        or t.provider_availability_status not in ('available','preview','limited_access'))
  ) then raise exception 'routing requires an enabled public route with available provider access'; end if;
  select to_jsonb(t) into v_after from public.v2_model_provider_routes t where provider_model_id=v_provider_model_id;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,'provider_route',v_provider_model_id,case when v_before is null then 'create' else 'update' end,v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values('provider_route',v_provider_model_id,'database_managed',p_actor_user_id,v_provider_model_id,now())
  on conflict(source_type,source_key) do update set disposition='database_managed',actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
  return v_after;
end $$;

revoke all on function public.mutate_v2_admin_provider_route(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_provider_route(uuid,text,jsonb) to service_role;

alter table public.v2_catalogue_admin_changes drop constraint if exists v2_catalogue_admin_changes_resource_type_check;
alter table public.v2_catalogue_admin_changes add constraint v2_catalogue_admin_changes_resource_type_check
  check (resource_type in ('pricing_sku','organisations','providers','benchmarks','subscription-plans','models','model_graph','provider_route','model_notice','model_aliases'));

create or replace function public.mutate_v2_admin_model_notice(
  p_actor_user_id uuid,
  p_model_slug text,
  p_notice jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  if not exists(select 1 from public.v2_models where model_slug=p_model_slug) then raise exception 'model not found'; end if;
  select to_jsonb(t) into v_before from public.v2_model_page_notices t where model_slug=p_model_slug;
  if p_notice is null or nullif(trim(p_notice->>'markdown'),'') is null then
    delete from public.v2_model_page_notices where model_slug=p_model_slug;
  else
    insert into public.v2_model_page_notices(model_slug,tone,markdown,updated_at)
    values(p_model_slug,coalesce(nullif(p_notice->>'tone',''),'info'),p_notice->>'markdown',now())
    on conflict(model_slug) do update set tone=excluded.tone,markdown=excluded.markdown,updated_at=now();
  end if;
  select to_jsonb(t) into v_after from public.v2_model_page_notices t where model_slug=p_model_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,'model_notice',p_model_slug,case when v_after is null then 'delete' when v_before is null then 'create' else 'update' end,v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values('model',p_model_slug,'database_managed',p_actor_user_id,p_model_slug,now())
  on conflict(source_type,source_key) do update set disposition='database_managed',actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
  return v_after;
end $$;

revoke all on function public.mutate_v2_admin_model_notice(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_model_notice(uuid,text,jsonb) to service_role;

create or replace function public.mutate_v2_admin_model_aliases(
  p_actor_user_id uuid,
  p_model_slug text,
  p_aliases jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  if not exists(select 1 from public.v2_models where model_slug=p_model_slug) then raise exception 'model not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by alias_slug),'[]'::jsonb) into v_before from public.v2_model_aliases t where model_slug=p_model_slug;
  delete from public.v2_model_aliases where model_slug=p_model_slug;
  insert into public.v2_model_aliases(alias_slug,model_slug,alias_type,enabled,effective_from,effective_to,metadata,updated_at)
  select lower(trim(x->>'alias_slug')),p_model_slug,coalesce(nullif(x->>'alias_type',''),'public'),coalesce((x->>'enabled')::boolean,true),nullif(x->>'effective_from','')::timestamptz,nullif(x->>'effective_to','')::timestamptz,coalesce(x->'metadata','{}'::jsonb)||jsonb_build_object('source','admin'),now()
  from jsonb_array_elements(coalesce(p_aliases,'[]'::jsonb)) x;
  select coalesce(jsonb_agg(to_jsonb(t) order by alias_slug),'[]'::jsonb) into v_after from public.v2_model_aliases t where model_slug=p_model_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,'model_aliases',p_model_slug,'save',v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values('model',p_model_slug,'database_managed',p_actor_user_id,p_model_slug,now())
  on conflict(source_type,source_key) do update set disposition='database_managed',actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
  return v_after;
end $$;

revoke all on function public.mutate_v2_admin_model_aliases(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.mutate_v2_admin_model_aliases(uuid,text,jsonb) to service_role;
