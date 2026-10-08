SELECT cron.schedule_in_database('activate-provider-catalog-releases', '*/5 * * * *', 'select public.activate_due_provider_catalog_releases()', 'postgres', NULL, true);

SELECT cron.schedule_in_database('cleanup-dormant-enterprise-teams', '0 0 1 * *', 'SELECT cleanup_dormant_enterprise_teams()', 'postgres', NULL, true);

SELECT cron.schedule_in_database('ensure-gateway-requests-partitions', '0 3 * * 1', 'select public.ensure_gateway_requests_partitions(1);', 'postgres', NULL, true);

SELECT
  cron.schedule_in_database('provider-health-refresh-queue', '* * * * *', 'set statement_timeout = ''10s''; select private.drain_provider_health_refresh(25);', 'postgres', NULL,
  true);

SELECT
  cron.schedule_in_database('prune-completed-analytics-outbox', '* * * * *',
  'set statement_timeout = ''10s''; set lock_timeout = ''500ms''; select private.prune_completed_analytics_outbox(500);', 'postgres', NULL, true);

SELECT
  cron.schedule_in_database('public-reporting-refresh-queue', '2-59/5 * * * *',
  'set statement_timeout = ''10s''; set lock_timeout = ''500ms''; select private.drain_public_reporting_refresh();', 'postgres', NULL, true);

SELECT
  cron.schedule_in_database('refresh-public-leaderboard-rollups', '7 3 * * *', 'select public.refresh_public_leaderboard_rollups(now() - interval ''90 days'', now());', 'postgres',
  NULL, false);

SELECT
  cron.schedule_in_database('refresh-public-model-user-usage-daily', '11 * * * *', 'select public.refresh_public_model_user_usage_daily(now() - interval ''2 days'', now());',
  'postgres', NULL, false);

SELECT
  cron.schedule_in_database('refresh-public-model-workspace-usage-weekly', '17 * * * *',
  'select public.refresh_public_model_workspace_usage_weekly(now() - interval ''12 weeks'', now());', 'postgres', NULL, false);
