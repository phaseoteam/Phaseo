begin;
insert into auth.users(id,email,raw_user_meta_data) values
 ('bda9db07-3cd1-4c2e-b17a-35f7ce953e01','provider-review-owner@example.invalid','{"full_name":"Review contract owner"}'),
 ('bda9db07-3cd1-4c2e-b17a-35f7ce953e02','provider-review-outsider@example.invalid','{"full_name":"Review contract outsider"}');
insert into public.workspaces(id,name,slug,publisher_handle,workspace_kind,owner_user_id)
values('bda9db07-3cd1-4c2e-b17a-35f7ce953e03','Provider review contract','provider-email-review-test','provider-email-review-test','provider','bda9db07-3cd1-4c2e-b17a-35f7ce953e01');
insert into public.workspace_members(workspace_id,user_id,role)
values('bda9db07-3cd1-4c2e-b17a-35f7ce953e03','bda9db07-3cd1-4c2e-b17a-35f7ce953e01','owner') on conflict do nothing;
insert into public.v2_providers(provider_slug,name,status,metadata)
values('provider-email-review-test','Provider review contract','not_ready','{"self_serve":{"provider_review_status":"awaiting_approval"}}');
insert into public.provider_account_links(provider_slug,workspace_id,linked_by,status,proof_method)
values('provider-email-review-test','bda9db07-3cd1-4c2e-b17a-35f7ce953e03','bda9db07-3cd1-4c2e-b17a-35f7ce953e01','active','provider_email');
insert into public.provider_catalog_sources(provider_slug,management_mode)
values('provider-email-review-test','managed');
insert into public.provider_onboarding_submissions(provider_slug,submitted_by,provider_name,website_url,application_type,catalog_mode)
values('provider-email-review-test','bda9db07-3cd1-4c2e-b17a-35f7ce953e01','Provider review contract','https://example.invalid','new','managed');
set local role service_role;
select public.review_provider_application('provider-email-review-test','approved',null,null);
insert into public.provider_catalog_events(provider_slug,workspace_id,event_type,title,message)
values('provider-email-review-test','bda9db07-3cd1-4c2e-b17a-35f7ce953e03','catalog_needs_changes','Catalog changes','Contract notification');
reset role;
do $test$
begin
 assert (select metadata#>>'{self_serve,provider_review_status}'='approved' from public.v2_providers where provider_slug='provider-email-review-test');
 assert (select count(*)=1 from public.email_outbox where workspace_id='bda9db07-3cd1-4c2e-b17a-35f7ce953e03' and kind='provider_application_reviewed' and to_email='provider-review-owner@example.invalid');
 assert not exists(select 1 from public.email_outbox where user_id='bda9db07-3cd1-4c2e-b17a-35f7ce953e02');
 assert (select count(*)=1 from public.email_outbox where workspace_id='bda9db07-3cd1-4c2e-b17a-35f7ce953e03' and kind='catalog_needs_changes' and to_email='provider-review-owner@example.invalid');
 assert not has_function_privilege('authenticated','public.enqueue_provider_catalog_event_email()','execute');
 assert not has_table_privilege('service_role','auth.users','select');
 assert (select prosecdef and 'search_path=""'=any(proconfig) from pg_proc where oid='public.enqueue_provider_catalog_event_email()'::regprocedure);
end $test$;
rollback;
