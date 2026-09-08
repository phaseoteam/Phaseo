-- phaseo:allow-production-history-backfill -- Restore a migration already applied to production outside this checkout.
-- Carry the new primary-location field through the current admin mutation
-- function without duplicating the rest of its catalogue mutation logic.
do $$
declare
  v_definition text;
  v_original text;
begin
  select pg_get_functiondef('public.mutate_v2_admin_catalogue(uuid,text,text,text,jsonb)'::regprocedure)
    into v_definition;
  v_original := v_definition;

  v_definition := replace(
    v_definition,
    $old$insert into public.v2_labs (lab_slug,name,country_code,description,status,metadata,updated_at)$old$,
    $new$insert into public.v2_labs (lab_slug,name,country_code,subdivision_code,description,status,metadata,updated_at)$new$
  );
  v_definition := replace(
    v_definition,
    $old$values (p_resource_id,p_payload->>'name',coalesce(nullif(p_payload->>'country_code',''),'xx'),nullif(p_payload->>'description',''),'active',$old$,
    $new$values (p_resource_id,p_payload->>'name',coalesce(nullif(p_payload->>'country_code',''),'xx'),nullif(p_payload->>'subdivision_code',''),nullif(p_payload->>'description',''),'active',$new$
  );
  v_definition := replace(
    v_definition,
    $old$name=excluded.name,country_code=excluded.country_code,description=excluded.description,metadata=public.v2_labs.metadata||excluded.metadata,updated_at=now();$old$,
    $new$name=excluded.name,country_code=excluded.country_code,subdivision_code=excluded.subdivision_code,description=excluded.description,metadata=public.v2_labs.metadata||excluded.metadata,updated_at=now();$new$
  );
  v_definition := replace(
    v_definition,
    $old$insert into public.v2_providers(provider_slug,name,status,country_code,base_url,default_execution_regions,byok_available,metadata,updated_at)$old$,
    $new$insert into public.v2_providers(provider_slug,name,status,country_code,subdivision_code,base_url,default_execution_regions,byok_available,metadata,updated_at)$new$
  );
  v_definition := replace(
    v_definition,
    $old$values(p_resource_id,p_payload->>'api_provider_name',lower(coalesce(nullif(p_payload->>'status',''),'active')),coalesce(nullif(p_payload->>'country_code',''),'xx'),nullif(p_payload->>'link',''),$old$,
    $new$values(p_resource_id,p_payload->>'api_provider_name',lower(coalesce(nullif(p_payload->>'status',''),'active')),coalesce(nullif(p_payload->>'country_code',''),'xx'),nullif(p_payload->>'subdivision_code',''),nullif(p_payload->>'link',''),$new$
  );
  v_definition := replace(
    v_definition,
    $old$name=excluded.name,status=excluded.status,country_code=excluded.country_code,base_url=excluded.base_url,$old$,
    $new$name=excluded.name,status=excluded.status,country_code=excluded.country_code,subdivision_code=excluded.subdivision_code,base_url=excluded.base_url,$new$
  );

  if v_definition = v_original or position('subdivision_code' in v_definition) = 0 then
    raise exception 'admin catalogue mutation function did not contain the expected location clauses';
  end if;
  execute v_definition;
end $$;

notify pgrst, 'reload schema';
