CREATE OR REPLACE FUNCTION public.apply_provider_catalog_feed_snapshot(
  p_provider_slug text, p_run_id uuid, p_feed_models jsonb, p_models jsonb, p_expected_version timestamptz
) RETURNS integer LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare source public.provider_catalog_sources%rowtype; result integer;
begin
  select * into source from public.provider_catalog_sources where provider_slug=p_provider_slug for update;
  if not found or source.management_mode <> 'remote' or p_expected_version is distinct from source.updated_at then raise exception 'provider_catalog_version_conflict'; end if;
  result := public.apply_provider_catalog_snapshot(p_provider_slug,p_run_id,p_models);
  update public.provider_catalog_sources set feed_models=p_feed_models where provider_slug=p_provider_slug;
  return result;
end;
$function$;
REVOKE ALL ON FUNCTION public.apply_provider_catalog_feed_snapshot(text,uuid,jsonb,jsonb,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_provider_catalog_feed_snapshot(text,uuid,jsonb,jsonb,timestamptz) TO service_role;
