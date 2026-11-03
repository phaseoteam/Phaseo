-- 0003_cron.sql: scheduled jobs (pg_cron) for Phaseo on PlanetScale Postgres 17.
--
-- Enable pg_cron in the PlanetScale dashboard first (it needs
-- shared_preload_libraries), then run this file on the direct connection in
-- the database that cron.database_name points at, as the role that owns the
-- schema (jobs run as the role that schedules them).
--
-- Source: supabase/schemas/_cluster/misc.sql. Only the 8 jobs that are active
-- on Supabase are scheduled. Each is unscheduled first when it exists, so the
-- file can be re-run. Commands are copied verbatim, with one exception:
-- cleanup-dormant-enterprise-teams calls cleanup_dormant_enterprise_teams(),
-- which 20260421130000_hard_rename_teams_to_workspaces renamed to
-- public.cleanup_dormant_enterprise_workspaces(), so on Supabase the job has
-- failed every month since April 2026. Here it calls the renamed function.
-- That function is now a no-op returning zero counts, so the job could also
-- be dropped (see SCHEMA-PORT.md).
--
-- Not scheduled (inactive on Supabase, active = false):
--   refresh-public-leaderboard-rollups           7 3 * * *  select public.refresh_public_leaderboard_rollups(now() - interval '90 days', now());
--   refresh-public-model-user-usage-daily        11 * * * * select public.refresh_public_model_user_usage_daily(now() - interval '2 days', now());
--   refresh-public-model-workspace-usage-weekly  17 * * * * select public.refresh_public_model_workspace_usage_weekly(now() - interval '12 weeks', now());
--
-- pg_strict: public.refresh_public_monitor_weekly_usage() (job
-- refresh-public-monitor-weekly-usage) runs a DELETE without WHERE and will be
-- rejected while pg_strict is on. See SCHEMA-PORT.md.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'activate-provider-catalog-releases';
SELECT cron.schedule('activate-provider-catalog-releases', '*/5 * * * *',
  $cmd$select public.activate_due_provider_catalog_releases()$cmd$);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-dormant-enterprise-teams';
SELECT cron.schedule('cleanup-dormant-enterprise-teams', '0 0 1 * *',
  $cmd$SELECT public.cleanup_dormant_enterprise_workspaces()$cmd$);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ensure-gateway-requests-partitions';
SELECT cron.schedule('ensure-gateway-requests-partitions', '0 3 * * 1',
  $cmd$select public.ensure_gateway_requests_partitions(1);$cmd$);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'provider-health-refresh-queue';
SELECT cron.schedule('provider-health-refresh-queue', '* * * * *',
  $cmd$set statement_timeout = '10s'; select private.drain_provider_health_refresh(25);$cmd$);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'prune-completed-analytics-outbox';
SELECT cron.schedule('prune-completed-analytics-outbox', '* * * * *',
  $cmd$set statement_timeout = '10s'; set lock_timeout = '500ms'; select private.prune_completed_analytics_outbox(500);$cmd$);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'public-reporting-refresh-queue';
SELECT cron.schedule('public-reporting-refresh-queue', '2-59/5 * * * *',
  $cmd$set statement_timeout = '10s'; set lock_timeout = '500ms'; select private.drain_public_reporting_refresh();$cmd$);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-public-monitor-weekly-usage';
SELECT cron.schedule('refresh-public-monitor-weekly-usage', '4-59/15 * * * *',
  $cmd$set statement_timeout = '120s'; set lock_timeout = '5s'; select public.refresh_public_monitor_weekly_usage();$cmd$);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'track-model-unserved-since';
SELECT cron.schedule('track-model-unserved-since', '41 * * * *',
  $cmd$set statement_timeout = '60s'; set lock_timeout = '5s'; select public.refresh_model_unserved_since();$cmd$);
