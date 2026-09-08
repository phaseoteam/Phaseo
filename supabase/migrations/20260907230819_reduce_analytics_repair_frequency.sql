-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

set local lock_timeout='5s';
-- Normal ingestion atomically queues new/updated facts for the incremental
-- processor. Retain historical repair for direct fact corrections, but avoid
-- requeuing 90 days of completed requests every hour.
-- Keep the existing command, active state and repair RPC unchanged.
do $$
declare
  repair_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into repair_job from cron.job
    where jobname = 'refresh-public-leaderboard-rollups'
      and schedule = '7 * * * *';
    if repair_job is not null then
      perform cron.alter_job(repair_job, schedule := '7 3 * * *');
    end if;
  end if;
end;
$$;
