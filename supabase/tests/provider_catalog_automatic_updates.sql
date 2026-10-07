begin;

insert into public.v2_service_tiers (service_tier_slug, display_name) values ('standard', 'Standard') on conflict do nothing;
insert into public.v2_meter_definitions (meter_key, display_name, modality, direction, unit)
values ('input_tokens', 'Input tokens', 'text', 'input', 'token') on conflict do nothing;
insert into public.v2_providers (provider_slug, name, status, base_url, metadata)
values ('catalog-contract-test', 'Catalog contract test', 'not_ready', 'https://example.invalid',
  '{"self_serve":{"provider_review_status":"approved"},"adapter_ready":true,"credentials_ready":true}');
insert into public.provider_catalog_sources (provider_slug, management_mode)
values ('catalog-contract-test', 'managed');

-- Previously approved canonical identities; provider offers remain automatic.
insert into public.v2_labs(lab_slug,name) values('catalog-contract-test','Contract test');
insert into public.v2_models(model_slug,lab_slug,name,hidden,metadata)
select 'catalog-contract-test/'||slug,'catalog-contract-test',slug,true,
  '{"provider_catalog_owner":"catalog-contract-test","created_from_provider_proposal":true}'::jsonb
from unnest(array['model-a','model-b','future','cancelled','multi']) slug;

do $test$
declare
  run1 uuid := gen_random_uuid();
  run2 uuid := gen_random_uuid();
  run3 uuid := gen_random_uuid();
  offer_id text;
  document jsonb := '[{"id":"catalog-contract-test/model-a","name":"Contract model A","providerModelSlug":"upstream-a","inputModalities":["text"],"outputModalities":["text"],"availability":"ready","availableFrom":"2026-01-01T00:00:00Z","capabilities":[{"id":"responses","parameters":["temperature","max_output_tokens"]}],"pricing":[{"meterKey":"input_tokens","modality":"text","direction":"input","unit":"token","unitQuantity":1000000,"priceNanos":250000000,"displayLabel":"Input","displayUnit":"1M tokens","conditions":[]}]},{"id":"catalog-contract-test/model-b","name":"Contract model B","providerModelSlug":"upstream-b","availability":"not_ready","capabilities":[{"id":"responses","parameters":[]}],"pricing":[]}]';
  bad_document jsonb;
  failure text;
  owner_id uuid := gen_random_uuid();
begin
  document := jsonb_set(document,'{0,capabilities}','[{"id":"responses","parameters":["temperature"]},{"id":"chat.completions","parameters":["max_output_tokens"]}]');
  assert not has_function_privilege('authenticated', 'public.apply_provider_catalog_snapshot(text,uuid,jsonb)', 'execute');
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger)
  values (run1,'catalog-contract-test','manual');
  assert public.apply_provider_catalog_snapshot('catalog-contract-test',run1,document) = 2;
  select provider_model_id into offer_id from public.v2_model_provider_routes
  where provider_slug='catalog-contract-test' and provider_model_slug='upstream-a';
  assert (select routing_enabled from public.v2_model_provider_routes where provider_model_id=offer_id);
  assert (select decision='approved' from public.provider_catalog_sync_models where run_id=run1 and model_slug='catalog-contract-test/model-a');
  assert (select review_status='approved' from public.provider_catalog_sync_runs where id=run1);
  assert (select params ? 'temperature' and params ? 'max_output_tokens' from public.v2_route_capabilities where provider_model_id=offer_id and capability_id='text.generate');
  assert (select not hidden from public.v2_models where model_slug='catalog-contract-test/model-a');
  assert (select hidden from public.v2_models where model_slug='catalog-contract-test/model-b');
  assert (select price_nanos=250000000 from public.v2_pricing_sku_meters meter join public.v2_pricing_skus sku using(sku_id) where sku.provider_model_id=offer_id and sku.status='active');
  assert (select operation='text.generate' from public.v2_pricing_skus where provider_model_id=offer_id and status='active');
  -- Reproduce a retired protocol alias retained by the existing migration history.
  -- Restore normalization before exercising any catalog writes.
  alter table public.v2_route_capabilities disable trigger canonical_routing_capability;
  insert into public.v2_route_capabilities (provider_model_id,capability_id,status,effective_from,effective_to,updated_at,metadata)
  values (offer_id,'responses','disabled',now()-interval '3 days',now()-interval '2 days',now()-interval '2 days',
    jsonb_build_object('managed_by','provider_catalog','source_run_id',run1));
  alter table public.v2_route_capabilities enable trigger canonical_routing_capability;

  -- Re-delivery and an unchanged new snapshot must not create new price versions.
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run1,document);
  assert (select count(*)=1 from public.v2_pricing_skus where provider_model_id=offer_id);
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,document);
  assert (select count(*)=1 from public.v2_pricing_skus where provider_model_id=offer_id);
  document := jsonb_set(document,'{0,name}','"Updated contract model"');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,document);
  assert (select name='Updated contract model' from public.v2_models where model_slug='catalog-contract-test/model-a');

  -- A changed price replaces the effective rate and preserves the earlier rate.
  update public.v2_pricing_skus set effective_from=now()-interval '1 minute' where provider_model_id=offer_id;
  document := jsonb_set(document, '{0,pricing,0,priceNanos}', '200000000');
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run3,'catalog-contract-test','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run3,document);
  assert (select count(*)=2 from public.v2_pricing_skus where provider_model_id=offer_id);
  assert (select price_nanos=200000000 from public.v2_pricing_sku_meters meter join public.v2_pricing_skus sku using(sku_id) where sku.provider_model_id=offer_id and sku.status='active');
  assert (select effective_from=now() from public.v2_pricing_skus where provider_model_id=offer_id and status='active');
  assert (select effective_to=now() from public.v2_pricing_skus where provider_model_id=offer_id and status='deprecated');

  -- Invalid pricing rolls back every write made by that snapshot.
  bad_document := jsonb_set(document, '{0,pricing,0,priceNanos}', '-1');
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  begin
    perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
    raise exception 'negative price was accepted';
  exception when check_violation then null;
  end;
  assert not exists(select 1 from public.provider_catalog_sync_models where run_id=run2);
  assert (select price_nanos=200000000 from public.v2_pricing_sku_meters meter join public.v2_pricing_skus sku using(sku_id) where sku.provider_model_id=offer_id and sku.status='active');

  -- Existing hidden canonical models cannot be published by a provider.
  insert into public.v2_models (model_slug,lab_slug,name,hidden) values ('catalog-contract-test/hidden','catalog-contract-test','Hidden contract model',true);
  bad_document := jsonb_set(document, '{0,id}', '"catalog-contract-test/hidden"');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
  assert (select decision='needs_changes' and decision_reason is not null
    from public.provider_catalog_sync_models where run_id=run2 and model_slug='catalog-contract-test/hidden');
  assert (select hidden from public.v2_models where model_slug='catalog-contract-test/hidden');
  assert not exists(select 1 from public.v2_model_provider_routes where model_slug='catalog-contract-test/hidden');
  update public.v2_models set hidden=true where model_slug='catalog-contract-test/model-a';
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,document);
  assert (select decision='needs_changes' from public.provider_catalog_sync_models
    where run_id=run2 and model_slug='catalog-contract-test/model-a');
  assert (select hidden from public.v2_models where model_slug='catalog-contract-test/model-a');
  update public.v2_models set hidden=false where model_slug='catalog-contract-test/model-a';
  bad_document := jsonb_set(document,'{0,id}','"unowned-catalog-contract/model"');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
  assert (select decision='needs_changes' from public.provider_catalog_sync_models
    where run_id=run2 and model_slug='unowned-catalog-contract/model');
  assert not exists(select 1 from public.v2_labs where lab_slug='unowned-catalog-contract');

  -- One unavailable ID and one unknown namespace do not roll back valid offers.
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  bad_document := document || jsonb_build_array(
    jsonb_set(document->0,'{id}','"catalog-contract-test/hidden"'),
    jsonb_set(document->0,'{id}','"unowned-catalog-contract/model"'));
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
  assert (select count(*)=2 from public.provider_catalog_sync_models where run_id=run2 and decision='approved');
  assert (select count(*)=2 from public.provider_catalog_sync_models where run_id=run2 and decision='needs_changes');
  assert (select review_status='partially_approved' and (review_summary->>'approved')::integer=2
    and (review_summary->>'needs_changes')::integer=2 from public.provider_catalog_sync_runs where id=run2);
  assert not exists(select 1 from public.v2_model_provider_routes where model_slug='catalog-contract-test/hidden');

  -- Omitting an offer retires only this provider's feed-managed routes.
  insert into public.v2_model_provider_routes (provider_model_id,model_slug,provider_slug,provider_model_slug,status,phaseo_status,provider_availability_status)
  values ('catalog-contract-manual','catalog-contract-test/model-b','catalog-contract-test','manual','active','planned','available');
  document := jsonb_build_array(document -> 0);
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,document);
  assert (select status='retired' and not routing_enabled from public.v2_model_provider_routes where provider_slug='catalog-contract-test' and provider_model_slug='upstream-b');
  assert (select status='active' from public.v2_model_provider_routes where provider_model_id='catalog-contract-manual');

  -- A provider offer can reference a shared model without rewriting its facts.
  insert into public.v2_labs (lab_slug,name) values ('catalog-other-lab','Other catalog lab');
  insert into public.v2_models (model_slug,lab_slug,name,hidden)
  values ('catalog-other-lab/shared','catalog-other-lab','Shared canonical name',false);
  bad_document := jsonb_set(jsonb_set(document,'{0,id}','"catalog-other-lab/shared"'),'{0,name}','"Provider display name"');
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
  assert (select name='Shared canonical name' from public.v2_models where model_slug='catalog-other-lab/shared');
  assert (select status='retired' from public.v2_model_provider_routes where provider_model_id=offer_id);
  assert (select routing_enabled from public.v2_model_provider_routes where provider_slug='catalog-contract-test' and model_slug='catalog-other-lab/shared');

  -- Scheduled offers stay hidden and activate automatically when their release is due.
  bad_document := jsonb_set(jsonb_set(document,'{0,id}','"catalog-contract-test/future"'),'{0,providerModelSlug}','"future"');
  bad_document := jsonb_set(bad_document,'{0,availableFrom}',to_jsonb((now()+interval '1 day')::text));
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
  assert (select hidden from public.v2_models where model_slug='catalog-contract-test/future');
  assert (select not routing_enabled from public.v2_model_provider_routes where provider_slug='catalog-contract-test' and provider_model_slug='future');
  assert public.activate_due_provider_catalog_releases()=0;
  update public.v2_model_provider_routes set effective_from=now()-interval '1 minute'
  where provider_slug='catalog-contract-test' and provider_model_slug='future';
  update public.v2_pricing_skus set effective_from=now()-interval '1 minute'
  where provider_model_id=(select provider_model_id from public.v2_model_provider_routes where provider_slug='catalog-contract-test' and provider_model_slug='future');
  assert public.activate_due_provider_catalog_releases()=1;
  assert (select not hidden from public.v2_models where model_slug='catalog-contract-test/future');

  -- A removed upcoming offer must never be reactivated by the release scheduler.
  bad_document := jsonb_set(jsonb_set(bad_document,'{0,id}','"catalog-contract-test/cancelled"'),'{0,providerModelSlug}','"cancelled"');
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);

  -- An approved provider can clear its feed without deleting historical records.
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  assert public.apply_provider_catalog_snapshot('catalog-contract-test',run2,'[]')=0;
  assert (select status='retired' and not routing_enabled from public.v2_model_provider_routes where provider_model_id=offer_id);
  assert (select count(*)=2 from public.v2_pricing_skus where provider_model_id=offer_id);
  assert (select status='active' from public.v2_model_provider_routes where provider_model_id='catalog-contract-manual');
  update public.v2_model_provider_routes set effective_from=now()-interval '1 minute'
  where provider_slug='catalog-contract-test' and provider_model_slug='cancelled';
  assert public.activate_due_provider_catalog_releases()=0;
  assert (select hidden from public.v2_models where model_slug='catalog-contract-test/cancelled');
  assert not exists(select 1 from public.v2_pricing_skus where provider_model_id=offer_id and status='active');
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,document);
  assert (select routing_enabled from public.v2_model_provider_routes where provider_model_id=offer_id);
  assert (select count(*)=1 from public.v2_pricing_skus where provider_model_id=offer_id and status='active');

  -- Revoked approval cannot publish changes or create new canonical models.
  perform public.set_self_serve_provider_review('catalog-contract-test','paused','Contract pause',null);
  assert (select status='paused' from public.provider_catalog_sources where provider_slug='catalog-contract-test');
  assert (select not routing_enabled from public.v2_model_provider_routes where provider_model_id=offer_id);
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  bad_document := jsonb_set(document,'{0,id}','"catalog-contract-test/not-approved"');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
  assert not exists(select 1 from public.v2_models where model_slug='catalog-contract-test/not-approved');
  assert (select review_status='pending' from public.provider_catalog_sync_runs where id=run2);
  perform public.set_self_serve_provider_review('catalog-contract-test','approved',null,null);
  assert (select status='active' and refresh_requested from public.provider_catalog_sources where provider_slug='catalog-contract-test');
  assert (select not routing_enabled from public.v2_model_provider_routes where provider_model_id=offer_id);
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,document);
  assert (select routing_enabled from public.v2_model_provider_routes where provider_model_id=offer_id);
  assert public.activate_due_provider_catalog_releases()=0;
  assert (select status='disabled' and updated_at=now()-interval '2 days' from public.v2_route_capabilities
    where provider_model_id=offer_id and capability_id='responses');
  bad_document := jsonb_set(jsonb_set(document,'{0,id}','"catalog-contract-test/multi"'),'{0,providerModelSlug}','"multi"');
  bad_document := jsonb_set(bad_document,'{0,capabilities}','[{"id":"responses","parameters":["temperature"]},{"id":"embeddings","parameters":["dimensions"]}]');
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-test','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
  assert (select count(*)=2 from public.v2_pricing_skus sku join public.v2_model_provider_routes route using(provider_model_id)
    where route.provider_slug='catalog-contract-test' and route.provider_model_slug='multi' and route.routing_enabled
      and sku.status='active' and sku.operation in ('text.generate','text.embed'));
  assert (select count(*)=2 from public.v2_pricing_sku_meters meter join public.v2_pricing_skus sku using(sku_id)
    join public.v2_model_provider_routes route using(provider_model_id)
    where route.provider_slug='catalog-contract-test' and route.provider_model_slug='multi' and route.routing_enabled
      and sku.status='active' and sku.operation in ('text.generate','text.embed') and meter.price_nanos=200000000);
  perform public.apply_provider_catalog_snapshot('catalog-contract-test',run2,bad_document);
  assert (select count(*)=2 from public.v2_pricing_skus sku join public.v2_model_provider_routes route using(provider_model_id)
    where route.provider_slug='catalog-contract-test' and route.provider_model_slug='multi');
  insert into public.v2_providers (provider_slug,name,status)
  values ('catalog-contract-unapproved','Unapproved contract provider','not_ready');
  insert into public.provider_catalog_sources (provider_slug,management_mode)
  values ('catalog-contract-unapproved','managed');
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-unapproved','manual');
  bad_document := jsonb_set(document,'{0,id}','"catalog-contract-unapproved/model"');
  perform public.apply_provider_catalog_snapshot('catalog-contract-unapproved',run2,bad_document);
  assert not exists(select 1 from public.v2_models where model_slug='catalog-contract-unapproved/model');
  assert (select review_status='pending' from public.provider_catalog_sync_runs where id=run2);
  insert into auth.users (id,email,raw_user_meta_data)
  values (owner_id,'catalog-contract-owner@example.invalid','{"full_name":"Catalog contract owner"}');
  update public.provider_catalog_sources set created_by=owner_id where provider_slug='catalog-contract-unapproved';
  insert into public.provider_onboarding_submissions (provider_slug,submitted_by,provider_name,website_url,application_type,catalog_mode)
  values ('catalog-contract-unapproved',owner_id,'Unapproved contract provider','https://example.invalid','claim','managed');
  update public.v2_providers set status='active' where provider_slug='catalog-contract-unapproved';
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-unapproved','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-unapproved',run2,bad_document);
  assert not exists(select 1 from public.v2_models where model_slug='catalog-contract-unapproved/model');
  update public.provider_onboarding_submissions set provider_review_status='approved' where provider_slug='catalog-contract-unapproved';
  run2 := gen_random_uuid();
  insert into public.provider_catalog_sync_runs (id,provider_slug,trigger) values (run2,'catalog-contract-unapproved','manual');
  perform public.apply_provider_catalog_snapshot('catalog-contract-unapproved',run2,bad_document);
  assert not exists(select 1 from public.v2_models where model_slug='catalog-contract-unapproved/model');
  assert exists(select 1 from public.provider_catalog_model_requests where model_slug='catalog-contract-unapproved/model' and status='pending');
end
$test$;

rollback;
