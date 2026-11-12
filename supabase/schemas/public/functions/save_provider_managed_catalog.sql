CREATE OR REPLACE FUNCTION public.save_provider_managed_catalog(
  p_provider_slug text, p_actor_id uuid, p_actor_kind text, p_expected_version timestamptz, p_document jsonb
) RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare source public.provider_catalog_sources%rowtype; actor_name text;
begin
  select * into source from public.provider_catalog_sources where provider_slug=p_provider_slug for update;
  if not found or source.management_mode <> 'managed' then raise exception 'provider_catalog_managed_source_required'; end if;
  if p_expected_version is distinct from coalesce(source.managed_updated_at,source.updated_at) then raise exception 'provider_catalog_version_conflict'; end if;
  if p_actor_id is null or p_actor_kind not in ('phaseo','provider') or jsonb_typeof(p_document) <> 'object' then raise exception 'provider_catalog_edit_invalid'; end if;
  select display_name into actor_name from public.users where user_id=p_actor_id;
  insert into public.provider_catalog_edit_events(provider_slug,model_slug,field,actor_id,actor_kind,actor_name,action,previous_value,value)
  values(p_provider_slug,'*','$catalog',p_actor_id,p_actor_kind,actor_name,'override',source.managed_catalog,p_document);
  update public.provider_catalog_sources set managed_catalog=p_document,managed_updated_by=p_actor_id,managed_updated_at=now(),refresh_requested=true,next_poll_at=now(),etag=null,last_modified=null,last_error=null,updated_at=now() where provider_slug=p_provider_slug;
end;
$function$;
REVOKE ALL ON FUNCTION public.save_provider_managed_catalog(text,uuid,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_provider_managed_catalog(text,uuid,text,timestamptz,jsonb) TO service_role;
