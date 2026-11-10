SELECT cron.schedule_in_database('activate-provider-catalog-releases', '*/5 * * * *', 'select public.activate_due_provider_catalog_releases()', 'postgres', NULL, true);

SELECT
  cron.schedule_in_database('enforce-pricing-promotion-budgets', '* * * * *',
  'set statement_timeout = ''30s''; set lock_timeout = ''5s''; select public.enforce_pricing_promotion_budgets();', 'postgres', NULL, true);

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
  cron.schedule_in_database('refresh-public-monitor-weekly-usage', '4-59/15 * * * *',
  'set statement_timeout = ''120s''; set lock_timeout = ''5s''; select public.refresh_public_monitor_weekly_usage();', 'postgres', NULL, true);

SELECT
  cron.schedule_in_database('track-model-unserved-since', '41 * * * *',
  'set statement_timeout = ''60s''; set lock_timeout = ''5s''; select public.refresh_model_unserved_since();', 'postgres', NULL, true);
