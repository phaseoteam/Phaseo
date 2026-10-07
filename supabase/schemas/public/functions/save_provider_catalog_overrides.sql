CREATE OR REPLACE FUNCTION public.save_provider_catalog_overrides(
  p_provider_slug text, p_actor_id uuid, p_actor_kind text, p_expected_version timestamptz, p_changes jsonb, p_feed_models jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $function$
declare
  source public.provider_catalog_sources%rowtype;
  change jsonb;
  model_id text;
  field_name text;
  old_value jsonb;
  fields jsonb;
  actor_name text;
  feed_value jsonb;
  feed_model jsonb;
begin
  select * into source from public.provider_catalog_sources where provider_slug = p_provider_slug for update;
  if not found or source.management_mode <> 'remote' then raise exception 'provider_catalog_remote_source_required'; end if;
  if p_actor_kind not in ('phaseo','provider') or p_actor_id is null then raise exception 'provider_catalog_actor_required'; end if;
  select display_name into actor_name from public.users where user_id=p_actor_id;
  if p_expected_version is null or p_expected_version <> source.updated_at then raise exception 'provider_catalog_version_conflict'; end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 16000 then raise exception 'provider_catalog_changes_invalid'; end if;
  source.feed_models := coalesce(source.feed_models,p_feed_models);
  for change in select value from jsonb_array_elements(p_changes) loop
    model_id := change->>'model_id'; field_name := change->>'field';
    if model_id is null or field_name is null or (field_name not in ('$model','$removed','name','description','providerModelSlug','inputModalities','outputModalities','contextLength','maxOutputTokens','availability','availableFrom','deprecatedAt','shutdownAt','capabilities','pricing','serviceTiers')
      and field_name !~ '^/pricing/[^/]+(/(modality|direction|unit|unitQuantity|priceNanos|[$]rate|displayLabel|displayUnit|conditions))?$'
      and field_name !~ '^/serviceTiers/(standard|fast|ultrafast|flex|batch)(/(providerModelSlug|upstreamServiceTier|availability)|/pricing/[^/]+(/(modality|direction|unit|unitQuantity|priceNanos|[$]rate|displayLabel|displayUnit|conditions))?)?$') then raise exception 'provider_catalog_override_field_invalid'; end if;
    fields := coalesce(source.catalog_overrides->model_id, '{}'::jsonb);
    old_value := fields->field_name;
    select model into feed_model from jsonb_array_elements(coalesce(source.feed_models,'[]'::jsonb)) model where model->>'id'=model_id limit 1;
    feed_value := public.provider_catalog_field_value(feed_model,field_name);
    if coalesce((change->>'revert')::boolean, false) then
      if old_value is null then continue; end if;
      fields := fields - field_name;
    else
      fields := fields || jsonb_build_object(field_name, jsonb_build_object('value',coalesce(change->'value','null'::jsonb),'actor_id',p_actor_id,'actor_kind',p_actor_kind,'actor_name',actor_name,'edited_at',now()));
    end if;
    source.catalog_overrides := source.catalog_overrides || jsonb_build_object(model_id,fields);
    insert into public.provider_catalog_edit_events(provider_slug,model_slug,field,actor_id,actor_kind,actor_name,action,previous_value,value)
    values(p_provider_slug,model_id,field_name,p_actor_id,p_actor_kind,actor_name,case when coalesce((change->>'revert')::boolean,false) then 'revert' else 'override' end,coalesce(old_value->'value',feed_value),case when coalesce((change->>'revert')::boolean,false) then feed_value else change->'value' end);
  end loop;
  if jsonb_array_length(p_changes) > 0 then
    update public.provider_catalog_sources set feed_models=source.feed_models,catalog_overrides=source.catalog_overrides,overrides_updated_at=now(),refresh_requested=true,next_poll_at=now(),updated_at=now() where provider_slug=p_provider_slug;
  end if;
end;
$function$;
REVOKE ALL ON FUNCTION public.save_provider_catalog_overrides(text,uuid,text,timestamptz,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_provider_catalog_overrides(text,uuid,text,timestamptz,jsonb,jsonb) TO service_role;
