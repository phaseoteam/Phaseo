-- Restored from Phaseo Prod migration records; already applied as version 20261008085911.
-- phaseo:allow-production-history-backfill reason: Record the migration already applied to production from a local checkout so db push history matches.
-- Smaller routing-only batches avoid intermittent production statement timeouts.
do $schedule$
begin
  perform cron.alter_job(
    jobid,
    command := $job$set statement_timeout = '10s'; set lock_timeout = '500ms'; select private.prune_routing_decision_details(500);$job$
  )
  from cron.job where jobname = 'prune-routing-decision-details';
end;
$schedule$;
