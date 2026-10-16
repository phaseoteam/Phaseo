begin;

-- Transactional contract: verify the actual catalog promotion path, then roll back.
insert into public.v2_providers (provider_slug,name,status,base_url,zero_data_retention,metadata)
values ('retention-contract-test','Retention contract test','not_ready','https://example.invalid',false,
 '{"self_serve":{"provider_review_status":"approved"},"adapter_ready":true,"credentials_ready":true}');
insert into public.provider_catalog_sources (provider_slug,management_mode)
values ('retention-contract-test','managed');
insert into public.v2_labs (lab_slug,name) values ('retention-contract-test','Retention contract test');
insert into public.v2_models (model_slug,lab_slug,name,hidden,metadata)
values ('retention-contract-test/native','retention-contract-test','Native',true,
 '{"provider_catalog_owner":"retention-contract-test","created_from_provider_proposal":true}');

do $test$
declare
 first_run uuid := gen_random_uuid();
 second_run uuid := gen_random_uuid();
 offer text;
 policy jsonb := '{"tier":"private","confidence":"confirmed","zeroDataRetention":true,"zdrEligibility":"eligible","retentionMode":"none","retentionDays":0}';
 document jsonb := '[{"id":"retention-contract-test/native","name":"Native","providerModelSlug":"native","inputModalities":["text"],"outputModalities":["text"],"availability":"ready","capabilities":[{"id":"text.generate","parameters":["temperature"]}],"pricing":[{"meterKey":"input_tokens","modality":"text","direction":"input","unit":"token","unitQuantity":1000000,"priceNanos":250000000,"displayLabel":"Input","displayUnit":"1M tokens","conditions":[]}]}]';
begin
 insert into public.provider_catalog_sync_runs (id,provider_slug,trigger)
 values (first_run,'retention-contract-test','manual');
 perform public.apply_provider_catalog_snapshot('retention-contract-test',first_run,document);
 select provider_model_id into strict offer from public.v2_model_provider_routes
 where provider_slug='retention-contract-test' and provider_model_slug='native';
 assert (select not zero_data_retention from public.v2_providers where provider_slug='retention-contract-test');
 assert (select not (metadata ? 'data_policy') from public.v2_route_capabilities where provider_model_id=offer and capability_id='text.generate');
 update public.v2_route_capabilities set metadata=metadata||jsonb_build_object('data_policy',policy),
  params=params||jsonb_build_object('data_policy',policy,'obsolete_catalog_parameter',true)
 where provider_model_id=offer and capability_id='text.generate';
 insert into public.provider_catalog_sync_runs (id,provider_slug,trigger)
 values (second_run,'retention-contract-test','manual');
 perform public.apply_provider_catalog_snapshot('retention-contract-test',second_run,document);
 assert (select params->'data_policy'=policy and metadata->'data_policy'=policy
  and params ? 'temperature' and not (params ? 'obsolete_catalog_parameter')
  from public.v2_route_capabilities where provider_model_id=offer and capability_id='text.generate');
 assert (select not zero_data_retention from public.v2_providers where provider_slug='retention-contract-test');
end $test$;

rollback;
