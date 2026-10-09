-- Run only on an isolated regression database: load fixtures/staged-reporting-before.sql,
-- then the reporting and availability migrations, then this transaction.
begin;
set local statement_timeout = '30s';

insert into public.users(user_id, role) values ('10000000-0000-4000-8000-000000000001','admin'), ('10000000-0000-4000-8000-000000000002','user');
insert into public.v2_providers(provider_slug, routing_enabled, routable) values ('fixture',true,true);
insert into public.v2_models(model_slug, name, hidden, status) values
  ('fixture/public','Public',false,'active'), ('fixture/staged','Staged',true,'draft'),
  ('fixture/internal-route','Internal route',false,'active'), ('fixture/unprepared','Unprepared',true,'draft');
insert into public.v2_model_provider_routes(provider_model_id, model_slug, provider_slug, provider_model_slug,
  status, routing_enabled, access_scope, phaseo_status, is_stealth, provider_availability_status) values
  ('fixture:public','fixture/public','fixture','public','active',true,'public','enabled',false,'available'),
  ('fixture:staged','fixture/staged','fixture','staged','active',false,'internal','testing',false,'preview'),
  ('fixture:disabled','fixture/staged','fixture','disabled','disabled',false,'internal','disabled',false,'unknown'),
  ('fixture:internal','fixture/internal-route','fixture','internal','active',true,'internal','enabled',false,'available');
insert into public.v2_route_capabilities(provider_model_id, capability_id, status)
  values('fixture:staged','text.generate','internal_testing');
insert into public.v2_pricing_skus(sku_id,provider_model_id,status,effective_from)
  values('10000000-0000-4000-8000-000000000010','fixture:staged','active',now()-interval '1 day');
insert into public.v2_pricing_sku_meters(sku_id,meter_key,price_nanos)
  values('10000000-0000-4000-8000-000000000010','input_tokens',1);

insert into public.v2_request_facts(request_event_id,workspace_id,request_id,occurred_at,routed_model_slug,
  requested_model_slug,provider_model_id,success,tool_call_count,status_code,safe_metadata) values
  ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','public',now()-interval '1 minute','fixture/public','fixture/public','fixture:public',true,0,200,'{}'),
  ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','staged',now()-interval '1 minute','fixture/staged','fixture/staged','fixture:staged',true,0,200,'{}'),
  ('20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','internal',now()-interval '1 minute','fixture/internal-route','fixture/internal-route','fixture:internal',true,0,200,'{}'),
  ('20000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','test-public',now()-interval '1 minute','fixture/public','fixture/public','fixture:public',true,0,200,'{"testing_mode":true}');
insert into public.data_contributions(id,workspace_id,request_id,occurred_at,model_slug,provider_slug,input_tokens,output_tokens)
  values('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','staged',now()-interval '1 minute','fixture/staged','fixture',10,20);

do $$ begin
  if (select count(*) from public.reporting_request_facts) <> 1 then raise exception 'Staged/internal/testing facts leaked'; end if;
  begin
    perform public.set_v2_admin_model_availability('10000000-0000-4000-8000-000000000002','fixture/staged',true);
    raise exception 'Non-admin release unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'actor must have the admin role' then raise; end if;
  end;
  begin
    perform public.set_v2_admin_model_availability('10000000-0000-4000-8000-000000000001','fixture/unprepared',true);
    raise exception 'Unprepared release unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'no prepared internal testing routes are ready for release' then raise; end if;
  end;
end $$;

select public.set_v2_admin_model_availability('10000000-0000-4000-8000-000000000001','fixture/staged',true);
update public.v2_request_facts set public_reporting_allowed=true where request_id='staged';
insert into public.v2_request_facts(request_event_id,workspace_id,request_id,occurred_at,routed_model_slug,
  requested_model_slug,provider_model_id,success,tool_call_count,status_code,safe_metadata)
  values('20000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','released',now(),'fixture/staged','fixture/staged','fixture:staged',true,0,200,'{}');
insert into public.data_contributions(id,workspace_id,request_id,occurred_at,model_slug,provider_slug,input_tokens,output_tokens)
  values('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','released',now(),'fixture/staged','fixture',30,40);

do $$ begin
  if (select public_reporting_allowed from public.v2_request_facts where request_id='staged') then raise exception 'Pre-release fact was upgraded'; end if;
  if (select count(*) from public.reporting_request_facts) <> 2 then raise exception 'Release leaked old traffic or hid new traffic'; end if;
  if not (select hidden=false and status='active' and catalogue_status='available' from public.v2_models where model_slug='fixture/staged') then raise exception 'Model not released'; end if;
  if not (select access_scope='public' and phaseo_status='enabled' and routing_enabled from public.v2_model_provider_routes where provider_model_id='fixture:staged') then raise exception 'Route not released'; end if;
  if (select status from public.v2_model_provider_routes where provider_model_id='fixture:disabled') <> 'disabled' then raise exception 'Disabled route promoted'; end if;
  if (select status from public.v2_route_capabilities where provider_model_id='fixture:staged') <> 'active' then raise exception 'Capability not released'; end if;
end $$;

insert into public.v2_analytics_outbox(request_event_id,occurred_at,status,available_at)
  select request_event_id,occurred_at,'pending',now() from public.v2_request_facts;
select public.process_v2_analytics_outbox(50);
do $$ begin
  if (select sum(requests) from public.v2_private_usage_daily) <> 5 then raise exception 'Private usage was lost'; end if;
  if (select sum(requests) from public.v2_public_usage_daily) <> 2 then raise exception 'Public daily rollup leaked test traffic'; end if;
  if (select sum(requests) from public.v2_public_usage_hourly) <> 2 then raise exception 'Public hourly rollup leaked test traffic'; end if;
  if (select total_requests_24h from public.get_public_summary_stats()) <> 2 then raise exception 'Public summary leaked'; end if;
end $$;

insert into public.workspace_classifiers(id,kind,slug) values('50000000-0000-4000-8000-000000000001','phaseo_task','fixture');
insert into public.request_classifications(contribution_id,classifier_id,primary_category)
  select id,'50000000-0000-4000-8000-000000000001'::uuid,'coding' from public.data_contributions;
select public.refresh_request_classification_rollup('40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001');
select public.refresh_public_model_task_daily(current_date);
select public.refresh_public_model_user_usage_daily(now()-interval '1 day',now()+interval '1 second');
select public.refresh_public_model_workspace_usage_weekly(now()-interval '1 day',now()+interval '1 second');
do $$ begin
  if (select request_count from public.request_classification_daily where model_slug='fixture/staged') <> 2 then raise exception 'Private classification changed'; end if;
  if (select request_count from public.public_model_task_daily where model_slug='fixture/staged') <> 1 then raise exception 'Public classification leaked staged traffic'; end if;
  if (select sum(requests) from public.public_model_user_usage_daily) <> 2 then raise exception 'Public user rollup leaked staged traffic'; end if;
  if (select sum(requests) from public.public_model_workspace_usage_weekly) <> 2 then raise exception 'Public retention rollup leaked staged traffic'; end if;
end $$;

select public.set_v2_admin_model_availability('10000000-0000-4000-8000-000000000001','fixture/staged',false);
set local role service_role;
do $$ begin
  if (select count(*) from public.reporting_usage_daily) <> 1 then raise exception 'Service-role daily reader leaked staged model'; end if;
  if (select count(*) from public.v2_web_public_usage_daily) <> 1 then raise exception 'Compatibility view leaked staged model'; end if;
  if (select count(*) from public.reporting_model_task_daily) <> 0 then raise exception 'Task reader leaked staged model'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  if (select count(*) from public.v2_public_usage_daily) <> 1 then raise exception 'Anonymous raw aggregate leaked staged model'; end if;
  if (select count(*) from public.public_model_task_daily) <> 0 then raise exception 'Anonymous task aggregate leaked staged model'; end if;
  if has_function_privilege('anon','public.set_v2_admin_model_availability(uuid,text,boolean)','execute') then raise exception 'Anonymous release RPC granted'; end if;
end $$;
reset role;
rollback;
