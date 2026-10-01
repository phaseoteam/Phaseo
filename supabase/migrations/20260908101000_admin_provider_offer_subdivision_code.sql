-- phaseo:allow-production-history-backfill -- Extend the provider-offer mutation with the primary subdivision field.
-- Provider saves use this function instead of mutate_v2_admin_catalogue.
do $$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.mutate_v2_admin_provider_offer(uuid,text,text,jsonb)'::regprocedure)
    into v_definition;
  v_original := v_definition;

  -- Keep this migration safe if the provider-offer function was updated manually.
  if position('subdivision_code' in v_definition) > 0 then
    return;
  end if;

  v_definition := replace(
    v_definition,
    $old$insert into public.v2_providers(provider_slug,name,provider_family_slug,offer_scope,offer_label,residency_mode,default_execution_regions,default_data_regions,country_code,base_url,byok_available,status,routing_enabled,routable,metadata,updated_at)$old$,
    $new$insert into public.v2_providers(provider_slug,name,provider_family_slug,offer_scope,offer_label,residency_mode,default_execution_regions,default_data_regions,country_code,subdivision_code,base_url,byok_available,status,routing_enabled,routable,metadata,updated_at)$new$
  );
  v_definition := replace(
    v_definition,
    $old$v_mode,v_exec,v_data,coalesce(nullif(p_payload->>'country_code',''),v_before->>'country_code','xx'),$old$,
    $new$v_mode,v_exec,v_data,coalesce(nullif(p_payload->>'country_code',''),v_before->>'country_code','xx'),case when p_payload ? 'subdivision_code' then nullif(trim(p_payload->>'subdivision_code'),'') else v_before->>'subdivision_code' end,$new$
  );
  v_definition := replace(
    v_definition,
    $old$default_data_regions=excluded.default_data_regions,country_code=excluded.country_code,base_url=excluded.base_url,$old$,
    $new$default_data_regions=excluded.default_data_regions,country_code=excluded.country_code,subdivision_code=excluded.subdivision_code,base_url=excluded.base_url,$new$
  );

  if v_definition = v_original or position('subdivision_code' in v_definition) = 0 then
    raise exception 'provider-offer mutation function did not contain the expected location clauses';
  end if;
  execute v_definition;
end $$;

notify pgrst, 'reload schema';
