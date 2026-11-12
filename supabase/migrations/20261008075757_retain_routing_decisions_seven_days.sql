-- Restored from Phaseo Prod migration records; already applied as version 20261008075757.
-- phaseo:allow-production-history-backfill reason: Record the migration already applied to production from a local checkout so db push history matches.
-- phaseo:allow-destructive-migration reason: operator-approved seven-day retention for routing decision details only
set local lock_timeout = '1s';
set local statement_timeout = '60s';

create index if not exists v2_request_routing_decisions_retention_idx
  on public.v2_request_routing_decisions (created_at, routing_decision_id);

create or replace function private.prune_routing_decision_details(p_batch_size integer default 5000)
returns integer
language plpgsql
security definer
set search_path = ''
set statement_timeout = '10s'
set lock_timeout = '500ms'
as $function$
declare
  v_deleted integer;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'Routing detail prune batch size must be between 1 and 5000';
  end if;

  with candidates as (
    select routing_decision_id
    from public.v2_request_routing_decisions
    where created_at < now() - interval '7 days'
    order by created_at, routing_decision_id
    limit p_batch_size
    for update skip locked
  )
  delete from public.v2_request_routing_decisions details
  using candidates
  where details.routing_decision_id = candidates.routing_decision_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function private.prune_routing_decision_details(integer)
  from public, anon, authenticated;
grant execute on function private.prune_routing_decision_details(integer) to service_role;

comment on function private.prune_routing_decision_details(integer) is
  'Prunes at most 5000 routing decision detail rows older than seven days. Does not change gateway logs, request facts, routing traces, archives, or usage/billing records.';

do $schedule$
begin
  perform cron.unschedule(jobid) from cron.job
  where jobname = 'prune-routing-decision-details';
  perform cron.schedule(
    'prune-routing-decision-details',
    '* * * * *',
    $job$set statement_timeout = '10s'; set lock_timeout = '500ms'; select private.prune_routing_decision_details(5000);$job$
  );
end;
$schedule$;
