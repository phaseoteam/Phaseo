-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.
-- phaseo:allow-destructive-migration reason: Restore already-applied history: the existing admin notice replacement function deletes only the selected model notice.

-- Restore the notice mutation independently of older, partially applied migrations.
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
  if p_notice is not null and (jsonb_typeof(p_notice)<>'object' or jsonb_typeof(p_notice->'markdown') is distinct from 'string' or length(p_notice->>'markdown')>20000 or coalesce(p_notice->>'tone','') not in ('info','warning','critical')) then raise exception 'invalid model notice'; end if;
  perform pg_advisory_xact_lock(hashtextextended('model-notice:'||p_model_slug,0));
  perform set_config('phaseo.catalogue_actor',p_actor_user_id::text,true);
  select to_jsonb(t) into v_before from public.v2_model_page_notices t where model_slug=p_model_slug for update;
  if p_notice is null or nullif(trim(p_notice->>'markdown'),'') is null then
    delete from public.v2_model_page_notices where model_slug=p_model_slug;
  else
    insert into public.v2_model_page_notices(model_slug,tone,markdown,updated_at)
    values(p_model_slug,p_notice->>'tone',trim(p_notice->>'markdown'),now())
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
