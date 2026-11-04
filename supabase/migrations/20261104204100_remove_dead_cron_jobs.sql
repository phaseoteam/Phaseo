-- Remove four pg_cron jobs that can never do useful work.
--
-- cleanup-dormant-enterprise-teams still calls cleanup_dormant_enterprise_teams(),
-- which was renamed to cleanup_dormant_enterprise_workspaces() long ago, so every
-- monthly run fails with "function does not exist". The renamed function is a
-- no-op compatibility shim under flat pricing (see apps/api/src/pipeline/pricing/
-- TIER-SYSTEM.md), so the job is dropped rather than repointed.
--
-- The three refresh-public-* jobs were disabled by
-- 20261003094412_queue_public_reporting_refreshes because their wide scans timed
-- out; public-reporting-refresh-queue and refresh-public-monitor-weekly-usage
-- (#2851) replaced them. They have not run since 2026-10-03.
--
-- The refresh functions themselves are left in place; removing them is a
-- separate change.
do $cleanup$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname in (
      'cleanup-dormant-enterprise-teams',
      'refresh-public-leaderboard-rollups',
      'refresh-public-model-user-usage-daily',
      'refresh-public-model-workspace-usage-weekly'
    );
  end if;
end;
$cleanup$;
