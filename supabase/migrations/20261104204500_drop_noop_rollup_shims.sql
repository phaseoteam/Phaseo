-- phaseo:allow-destructive-migration reason: drop unused pre-v2 rollup shim functions and their dead view. No table, column or row is removed; every dropped object has no caller in code, SQL, cron or the Data API.

-- Drop the pre-v2 rollup shims and two uncalled request helpers.
--
-- apply_workspace_usage_rollup_delta only returns (rollup writes were disabled).
-- refresh_gateway_activity_rollup_daily, refresh_gateway_model_usage_daily,
-- refresh_gateway_usage_rollups, refresh_gateway_usage_rollups_workspace_scope and
-- refresh_public_leaderboard_rollups are one-line wrappers around
-- refresh_v2_analytics_range. The last was only called by the disabled cron job
-- refresh-public-leaderboard-rollups, which 20261104165000_remove_dead_cron_jobs
-- unschedules. backfill_gateway_request_normalized_usage and
-- gateway_request_usage_rollup_rows have no callers. The view
-- v2_rpc_gateway_activity_rollup_daily is read by nothing and was anon-selectable.
--
-- Kept: refresh_v2_analytics_range, refresh_public_model_user_usage_daily and
-- refresh_public_model_workspace_usage_weekly (private.drain_public_reporting_refresh
-- calls the last two).

DROP FUNCTION IF EXISTS public.apply_workspace_usage_rollup_delta(timestamptz, uuid, uuid, text, text, bigint, bigint, bigint, bigint, numeric, bigint, numeric, bigint);
DROP FUNCTION IF EXISTS public.refresh_gateway_activity_rollup_daily(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.refresh_gateway_model_usage_daily(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.refresh_gateway_usage_rollups(timestamptz);
DROP FUNCTION IF EXISTS public.refresh_gateway_usage_rollups_workspace_scope(timestamptz);
DROP FUNCTION IF EXISTS public.refresh_public_leaderboard_rollups(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.backfill_gateway_request_normalized_usage(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.gateway_request_usage_rollup_rows(timestamptz, timestamptz);
DROP VIEW IF EXISTS public.v2_rpc_gateway_activity_rollup_daily;
