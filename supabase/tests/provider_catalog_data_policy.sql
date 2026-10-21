begin;

-- Transactional contract: verify the actual catalog promotion path, then roll back.
insert into public.v2_providers (provider_slug,name,status,base_url,zero_data_retention,metadata)
values ('catalog-policy-test','Retention contract test','not_ready','https://example.invalid',false,
 '{"self_serve":{"provider_review_status":"approved"},"adapter_ready":true,"credentials_ready":true}');
insert into public.provider_catalog_sources (provider_slug,management_mode)
values ('catalog-policy-test','managed');
insert into public.v2_labs (lab_slug,name) values ('catalog-policy-test','Retention contract test');
insert into public.v2_models (model_slug,lab_slug,name,hidden,metadata)
values ('catalog-policy-test/native','catalog-policy-test','Native',true,
 '{"provider_catalog_owner":"catalog-policy-test","created_from_provider_proposal":true}');


insert into auth.users(id) values ('10000000-0000-4000-8000-000000000012');
update public.provider_catalog_sources set last_success_at=now() where provider_slug='catalog-policy-test';
do $test$
declare
 run uuid := gen_random_uuid();
 offer text;
 result jsonb;
 policy jsonb := '{"id":"text.generate","training_policy":"no_train","retention_mode":"none","retention_days":0,"zero_data_retention":true,"zdr_eligibility":"eligible","requirements":{"contract_mode":"none","account_settings":[]},"privacy_policy_url":"https://provider.example/privacy","terms_of_service_url":"https://provider.example/terms"}';
 document jsonb := '[{"id":"catalog-policy-test/native","name":"Native","providerModelSlug":"native","inputModalities":["text"],"outputModalities":["text"],"availability":"ready","capabilities":[{"id":"text.generate","parameters":["temperature"]}],"pricing":[{"meterKey":"input_tokens","modality":"text","direction":"input","unit":"token","unitQuantity":1000000,"priceNanos":250000000,"displayLabel":"Input","displayUnit":"1M tokens","conditions":[]}]}]';
 snapshot jsonb;
begin
 snapshot := jsonb_set(document,'{0,serviceTiers}',jsonb_build_array(jsonb_build_object('serviceTier','standard','providerModelSlug','native','availability','ready','pricing',document->0->'pricing','dataPolicy',jsonb_build_object('capabilities',jsonb_build_array(policy)))));
 snapshot := jsonb_set(snapshot,'{0,declarations}','{"hugging_face_id":"lab/model","quantization":"fp8","passthrough_parameters":{"seed":{"type":"integer","min":0}}}'::jsonb);
 snapshot := jsonb_set(snapshot,'{0,serviceTiers,0,declarations}','{"deployment_region":"US","discount_to_user":0.2}'::jsonb);
 insert into public.provider_catalog_sync_runs(id,provider_slug,trigger) values(run,'catalog-policy-test','manual');
 perform public.apply_provider_catalog_snapshot('catalog-policy-test',run,snapshot);
 select provider_model_id into strict offer from public.v2_model_provider_routes where provider_slug='catalog-policy-test';
 assert (select metadata->'catalog_declarations'->'model'->>'quantization'='fp8'
   and metadata->'catalog_declarations'->'offer'->>'deployment_region'='US'
   from public.v2_model_provider_routes where provider_model_id=offer), 'Rich claims must survive database promotion';
 assert (select not (params ? 'seed') from public.v2_route_capabilities where provider_model_id=offer and capability_id='text.generate'), 'Passthrough declaration must not enable execution';
 result := public.resolve_catalog_data_policy(offer,'text.generate');
 assert result->'zeroDataRetention'='false'::jsonb, 'Unapproved claims must not grant ZDR';
 insert into public.provider_catalog_policy_approvals(provider_slug,enabled,management_mode,privacy_policy_url,approved_by)
 values('catalog-policy-test',true,'managed','https://provider.example/privacy','10000000-0000-4000-8000-000000000012');
 result := public.resolve_catalog_data_policy(offer,'text.generate');
 assert result->'zeroDataRetention'='true'::jsonb and result->>'confidence'='confirmed', 'Approved claim must become effective';
 assert (select metadata->'data_policy'->'zeroDataRetention'='true'::jsonb from public.v2_effective_route_capabilities where provider_model_id=offer and capability_id='text.generate'), 'Public and gateway projection must agree';
 -- A skipped projection must withdraw the previous grant before source freshness advances.
 -- Initial promotion publishes the fixture, so explicitly hide it again.
 update public.v2_models set hidden=true, metadata=metadata||'{"provider_catalog_owner":"another-provider"}'::jsonb where model_slug='catalog-policy-test/native';
 run := gen_random_uuid();
 insert into public.provider_catalog_sync_runs(id,provider_slug,trigger) values(run,'catalog-policy-test','manual');
 perform public.apply_provider_catalog_snapshot('catalog-policy-test',run,jsonb_set(snapshot,'{0,serviceTiers,0,dataPolicy}','null'::jsonb));
 assert (select decision='needs_changes' from public.provider_catalog_sync_models where run_id=run and model_slug='catalog-policy-test/native'), 'Hidden unowned model must skip promotion';
 update public.provider_catalog_sources set last_success_at=now() where provider_slug='catalog-policy-test';
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='false'::jsonb, 'Skipped promotion cannot refresh an older guarantee';
 update public.v2_models set hidden=false, metadata=metadata||'{"provider_catalog_owner":"catalog-policy-test"}'::jsonb where model_slug='catalog-policy-test/native';
 run := gen_random_uuid();
 insert into public.provider_catalog_sync_runs(id,provider_slug,trigger) values(run,'catalog-policy-test','manual');
 perform public.apply_provider_catalog_snapshot('catalog-policy-test',run,snapshot);
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='true'::jsonb, 'Accepted promotion can restore a current declaration';
 update public.v2_providers set metadata=jsonb_set(metadata,'{self_serve,provider_review_status}','"awaiting_approval"'::jsonb) where provider_slug='catalog-policy-test';
 run := gen_random_uuid();
 insert into public.provider_catalog_sync_runs(id,provider_slug,trigger) values(run,'catalog-policy-test','manual');
 perform public.apply_provider_catalog_snapshot('catalog-policy-test',run,snapshot);
 update public.provider_catalog_sources set last_success_at=now() where provider_slug='catalog-policy-test';
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='false'::jsonb, 'Unapproved provider cannot renew a previous guarantee';
 update public.v2_providers set metadata=jsonb_set(metadata,'{self_serve,provider_review_status}','"approved"'::jsonb) where provider_slug='catalog-policy-test';
 run := gen_random_uuid();
 insert into public.provider_catalog_sync_runs(id,provider_slug,trigger) values(run,'catalog-policy-test','manual');
 perform public.apply_provider_catalog_snapshot('catalog-policy-test',run,snapshot);
 update public.provider_catalog_policy_approvals set enabled=false where provider_slug='catalog-policy-test';
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='false'::jsonb, 'Trust revocation must not require feed fetch';
 update public.provider_catalog_policy_approvals set enabled=true where provider_slug='catalog-policy-test';
 update public.provider_catalog_sources set last_success_at=now()-interval '25 hours' where provider_slug='catalog-policy-test';
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='false'::jsonb, 'Stale policy must expire';
 update public.provider_catalog_sources set last_success_at=now() where provider_slug='catalog-policy-test';
 -- The same approved source can retract its policy on the next accepted snapshot.
 run := gen_random_uuid();
 snapshot := jsonb_set(snapshot,'{0,serviceTiers,0,dataPolicy,capabilities,0,zero_data_retention}','false'::jsonb);
 snapshot := jsonb_set(snapshot,'{0,serviceTiers,0,dataPolicy,capabilities,0,zdr_eligibility}','"ineligible"'::jsonb);
 insert into public.provider_catalog_sync_runs(id,provider_slug,trigger) values(run,'catalog-policy-test','manual');
 perform public.apply_provider_catalog_snapshot('catalog-policy-test',run,snapshot);
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='false'::jsonb, 'Explicit false must revoke a previous Yes';
 run := gen_random_uuid();
 snapshot := jsonb_set(snapshot,'{0,serviceTiers,0,dataPolicy}','null'::jsonb);
 insert into public.provider_catalog_sync_runs(id,provider_slug,trigger) values(run,'catalog-policy-test','manual');
 perform public.apply_provider_catalog_snapshot('catalog-policy-test',run,snapshot);
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='false'::jsonb, 'Null must withdraw policy';
 update public.v2_providers set zero_data_retention=true where provider_slug='catalog-policy-test';
 -- A later legacy document withdraws the catalog claim and cannot inherit provider Yes.
 run := gen_random_uuid();
 insert into public.provider_catalog_sync_runs(id,provider_slug,trigger) values(run,'catalog-policy-test','manual');
 perform public.apply_provider_catalog_snapshot('catalog-policy-test',run,document);
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='false'::jsonb, 'Downgrade must withdraw catalog grant';
 update public.v2_route_capabilities set metadata=metadata||'{"data_policy":{"zeroDataRetention":true,"confidence":"confirmed","tier":"private"}}'::jsonb where provider_model_id=offer;
 assert public.resolve_catalog_data_policy(offer,'text.generate')->'zeroDataRetention'='true'::jsonb, 'Admin pin must survive feed withdrawal';
 assert (select count(*)=3 from public.provider_catalog_policy_approval_events where provider_slug='catalog-policy-test'), 'Approval changes require audit history';
end $test$;
rollback;
