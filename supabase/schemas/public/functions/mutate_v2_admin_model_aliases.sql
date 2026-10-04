CREATE OR REPLACE FUNCTION public.mutate_v2_admin_model_aliases (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_aliases       jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_before jsonb;
  v_after jsonb;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  if not exists(select 1 from public.v2_models where model_slug=p_model_slug) then raise exception 'model not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by alias_slug),'[]'::jsonb) into v_before from public.v2_model_aliases t where model_slug=p_model_slug;
  perform set_config('phaseo.catalogue_actor',p_actor_user_id::text,true);
  if exists(select 1 from jsonb_array_elements(p_aliases) x join public.v2_model_aliases a on a.alias_slug=lower(trim(x->>'alias_slug')) where a.model_slug<>p_model_slug) then raise exception 'alias belongs to another model'; end if;
  insert into public.v2_model_aliases(alias_slug,model_slug,alias_type,enabled,effective_from,effective_to,metadata,updated_at)
  select lower(trim(x->>'alias_slug')),p_model_slug,coalesce(nullif(x->>'alias_type',''),'public'),coalesce((x->>'enabled')::boolean,true),nullif(x->>'effective_from','')::timestamptz,nullif(x->>'effective_to','')::timestamptz,coalesce(x->'metadata','{}'::jsonb)||jsonb_build_object('source','admin'),now()
  from jsonb_array_elements(coalesce(p_aliases,'[]'::jsonb)) x
  on conflict(alias_slug) do update set alias_type=excluded.alias_type,enabled=excluded.enabled,effective_from=excluded.effective_from,effective_to=excluded.effective_to,metadata=excluded.metadata,updated_at=now();
  select coalesce(jsonb_agg(to_jsonb(t) order by alias_slug),'[]'::jsonb) into v_after from public.v2_model_aliases t where model_slug=p_model_slug;
  insert into public.v2_catalogue_admin_changes(actor_user_id,resource_type,resource_id,action,before_state,after_state)
  values(p_actor_user_id,'model_aliases',p_model_slug,'save',v_before,v_after);
  insert into public.v2_catalogue_source_overrides(source_type,source_key,disposition,actor_user_id,resource_id,updated_at)
  values('model',p_model_slug,'database_managed',p_actor_user_id,p_model_slug,now())
  on conflict(source_type,source_key) do update set disposition='database_managed',actor_user_id=excluded.actor_user_id,resource_id=excluded.resource_id,updated_at=now();
  return v_after;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_aliases"(uuid, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_aliases"(uuid, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_aliases"(uuid, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_aliases"(uuid, text, jsonb) FROM PUBLIC, "anon", "authenticated";
