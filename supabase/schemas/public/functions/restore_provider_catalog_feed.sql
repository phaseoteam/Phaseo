CREATE OR REPLACE FUNCTION public.restore_provider_catalog_feed(
  p_provider_slug text, p_actor_id uuid, p_actor_kind text, p_expected_version timestamptz
) RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare source public.provider_catalog_sources%rowtype; actor_name text;
begin
  select * into source from public.provider_catalog_sources where provider_slug=p_provider_slug for update;
  if not found or source.catalog_url is null then raise exception 'provider_catalog_remote_source_required'; end if;
  if p_expected_version is distinct from coalesce(source.managed_updated_at,source.updated_at) then raise exception 'provider_catalog_version_conflict'; end if;
  if p_actor_id is null or p_actor_kind not in ('phaseo','provider') then raise exception 'provider_catalog_actor_required'; end if;
  if source.management_mode='remote' then return; end if;
  select display_name into actor_name from public.users where user_id=p_actor_id;
  insert into public.provider_catalog_edit_events(provider_slug,model_slug,field,actor_id,actor_kind,actor_name,action,previous_value,value)
  values(p_provider_slug,'*','$catalog',p_actor_id,p_actor_kind,actor_name,'revert',source.managed_catalog,source.feed_models);
  update public.provider_catalog_sources set management_mode='remote',managed_catalog=null,managed_updated_by=null,managed_updated_at=null,catalog_updated_at=now(),refresh_requested=true,next_poll_at=now(),updated_at=now() where provider_slug=p_provider_slug;
end;
$function$;
REVOKE ALL ON FUNCTION public.restore_provider_catalog_feed(text,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_provider_catalog_feed(text,uuid,text,timestamptz) TO service_role;
