begin;
insert into auth.users(id,email) values('aaaaaaaa-7777-4444-8888-000000000001','catalog-overrides-test@example.invalid');
insert into public.v2_providers(provider_slug,name,status) values('catalog-overrides-test','Overrides contract','not_ready');
insert into public.provider_catalog_sources(provider_slug,catalog_url,management_mode,feed_models)
values('catalog-overrides-test','https://example.invalid/models','remote','[{"id":"catalog-overrides-test/model","name":"Feed name"}]');
do $test$
declare version timestamptz;
begin
  assert not has_function_privilege('authenticated','public.save_provider_catalog_overrides(text,uuid,text,timestamptz,jsonb,jsonb)','execute');
  assert not has_table_privilege('authenticated','public.provider_catalog_edit_events','select');
  assert not has_table_privilege('service_role','public.provider_catalog_edit_events','update');
  select updated_at into version from public.provider_catalog_sources where provider_slug='catalog-overrides-test';
  perform public.save_provider_catalog_overrides('catalog-overrides-test','aaaaaaaa-7777-4444-8888-000000000001','phaseo',version,'[{"model_id":"catalog-overrides-test/model","field":"name","value":"Corrected"}]');
  assert (select management_mode='remote' and catalog_overrides->'catalog-overrides-test/model'->'name'->>'value'='Corrected' from public.provider_catalog_sources where provider_slug='catalog-overrides-test');
  assert exists(select 1 from public.provider_catalog_edit_events where provider_slug='catalog-overrides-test' and actor_kind='phaseo' and previous_value='"Feed name"' and value='"Corrected"');
  begin
    perform public.save_provider_catalog_overrides('catalog-overrides-test','aaaaaaaa-7777-4444-8888-000000000001','provider',version-interval '1 minute','[{"model_id":"catalog-overrides-test/model","field":"name","value":"Stale"}]');
    raise exception 'stale edit unexpectedly accepted';
  exception when raise_exception then
    if SQLERRM <> 'provider_catalog_version_conflict' then raise; end if;
  end;
  select updated_at into version from public.provider_catalog_sources where provider_slug='catalog-overrides-test';
  perform public.save_provider_catalog_overrides('catalog-overrides-test','aaaaaaaa-7777-4444-8888-000000000001','provider',version,'[{"model_id":"catalog-overrides-test/model","field":"name","revert":true}]');
  assert (select not (catalog_overrides->'catalog-overrides-test/model' ? 'name') from public.provider_catalog_sources where provider_slug='catalog-overrides-test');
  assert exists(select 1 from public.provider_catalog_edit_events where provider_slug='catalog-overrides-test' and actor_kind='provider' and action='revert' and previous_value='"Corrected"' and value='"Feed name"');
  begin
    perform public.apply_provider_catalog_feed_snapshot('catalog-overrides-test',gen_random_uuid(),'[]','[]',version-interval '1 minute');
    raise exception 'stale feed unexpectedly accepted';
  exception when raise_exception then
    if SQLERRM <> 'provider_catalog_version_conflict' then raise; end if;
  end;
  assert (select feed_models->0->>'name'='Feed name' from public.provider_catalog_sources where provider_slug='catalog-overrides-test');
  update public.provider_catalog_sources set management_mode='managed',managed_catalog='{"data":[]}' where provider_slug='catalog-overrides-test';
  select updated_at into version from public.provider_catalog_sources where provider_slug='catalog-overrides-test';
  perform public.save_provider_managed_catalog('catalog-overrides-test','aaaaaaaa-7777-4444-8888-000000000001','phaseo',version,'{"data":[]}');
  assert exists(select 1 from public.provider_catalog_edit_events where provider_slug='catalog-overrides-test' and field='$catalog' and actor_kind='phaseo' and action='override');
  select managed_updated_at into version from public.provider_catalog_sources where provider_slug='catalog-overrides-test';
  perform public.restore_provider_catalog_feed('catalog-overrides-test','aaaaaaaa-7777-4444-8888-000000000001','provider',version);
  assert (select management_mode='remote' and managed_catalog is null from public.provider_catalog_sources where provider_slug='catalog-overrides-test');
  assert exists(select 1 from public.provider_catalog_edit_events where provider_slug='catalog-overrides-test' and field='$catalog' and actor_kind='provider' and action='revert');
end;
$test$;
rollback;
