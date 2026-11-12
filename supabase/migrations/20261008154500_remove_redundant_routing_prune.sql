-- Routing details leave SQL only through gateway_commit_routing_archive, which
-- deletes a request's decisions and traces after its R2 archive is verified.
-- The out-of-band prune could only match archived requests that still had SQL
-- rows, a set the commit keeps empty, so every run scanned the whole retention
-- backlog, hit its statement timeout and repeated a minute later. On production
-- (2026-10-08) that sustained IO exhausted the instance. Unarchived details stay
-- until the archive backfill commits them.
do $cleanup$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-routing-decision-details';
  end if;
end;
$cleanup$;

drop function if exists private.prune_routing_decision_details(integer);
