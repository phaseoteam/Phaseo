-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- phaseo:allow-production-history-backfill reason: Version 20260907233625 is already applied in production; restore its recorded SQL without replaying it.
-- Original version and SQL are retained; this migration is already applied in production.

-- These RPCs are used by the service-role Worker, not browser database clients.
-- Keep the SQL bodies and public HTTP contracts unchanged.
revoke execute on function public.get_v2_model_apps(text,integer) from public, anon, authenticated;
grant execute on function public.get_v2_model_apps(text,integer) to service_role;

revoke execute on function public.get_v2_model_overview(text,text,text) from public, anon, authenticated;
grant execute on function public.get_v2_model_overview(text,text,text) to service_role;

revoke execute on function public.get_v2_model_performance_colos(text) from public, anon, authenticated;
grant execute on function public.get_v2_model_performance_colos(text) to service_role;

revoke execute on function public.get_v2_model_performance_metrics(text,text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.get_v2_model_performance_metrics(text,text,numeric,text,text) to service_role;

revoke execute on function public.get_v2_model_pricing(text,text,text) from public, anon, authenticated;
grant execute on function public.get_v2_model_pricing(text,text,text) to service_role;

revoke execute on function public.get_v2_model_provider_hourly_performance_v1(text,text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_hourly_performance_v1(text,text,numeric,text,text) to service_role;

revoke execute on function public.get_v2_model_provider_hourly_performance_v2(text,text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_hourly_performance_v2(text,text,numeric,text,text) to service_role;

revoke execute on function public.get_v2_model_provider_percentile_series_v2(text,text,text,text) from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_percentile_series_v2(text,text,text,text) to service_role;

revoke execute on function public.get_v2_public_model_weekly_metrics() from public, anon, authenticated;
grant execute on function public.get_v2_public_model_weekly_metrics() to service_role;

revoke execute on function public.get_v2_public_models_page_rows(text,text) from public, anon, authenticated;
grant execute on function public.get_v2_public_models_page_rows(text,text) to service_role;

revoke execute on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to service_role;

revoke execute on function public.marketplace_preset_fork_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.marketplace_preset_fork_counts(uuid[]) to service_role;

-- The invoker wrapper depends on the now service-only catalogue function.
revoke execute on function public.get_public_models_page_rows() from public, anon, authenticated;
grant execute on function public.get_public_models_page_rows() to service_role;

-- Permission helpers used by authenticated RLS policies need no anonymous access.
revoke execute on function public.is_active_invite_for_workspace(uuid,uuid) from public, anon;
grant execute on function public.is_active_invite_for_workspace(uuid,uuid) to authenticated, service_role;

revoke execute on function public.is_admin_user() from public, anon;
grant execute on function public.is_admin_user() to authenticated, service_role;

revoke execute on function public.is_team_owner(uuid) from public, anon;
grant execute on function public.is_team_owner(uuid) to authenticated, service_role;

revoke execute on function public.is_workspace_admin(uuid) from public, anon;
grant execute on function public.is_workspace_admin(uuid) to authenticated, service_role;

revoke execute on function public.is_workspace_member(uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;

-- These policies previously targeted PUBLIC, but their predicates require a user.
alter policy "Enable insert for users based on user_id" on public.credit_ledger to authenticated;
alter policy gateway_batch_requests_select_workspace_members on public.gateway_batch_requests to authenticated;
alter policy gateway_webhook_endpoints_insert_workspace_admins on public.gateway_webhook_endpoints to authenticated;
alter policy gateway_webhook_endpoints_select_workspace_members on public.gateway_webhook_endpoints to authenticated;
alter policy gateway_webhook_endpoints_update_workspace_admins on public.gateway_webhook_endpoints to authenticated;

notify pgrst, 'reload schema';
