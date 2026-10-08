-- Restored from Phaseo Prod migration records; already applied as version 20261008102104.
-- phaseo:allow-production-history-backfill reason: Record the migration already applied to production from a local checkout so db push history matches.
-- phaseo:allow-destructive-migration reason: approved retention for completed queue state only; source facts and rollups remain
set local lock_timeout = '1s';
set local statement_timeout = '30s';
create index v2_analytics_outbox_completed_retention_idx
  on public.v2_analytics_outbox (updated_at, request_event_id) where status = 'complete';

create function private.prune_completed_analytics_outbox(p_batch_size integer default 500)
returns integer language plpgsql security definer
set search_path = '' set statement_timeout = '10s' set lock_timeout = '500ms'
as $function$
declare v_deleted integer;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 5000 then
    raise exception 'Completed outbox prune batch size must be between 1 and 5000';
  end if;
  with candidates as (
    select request_event_id from public.v2_analytics_outbox
    where status = 'complete' and updated_at < now() - interval '7 days'
    order by updated_at, request_event_id
    limit p_batch_size for update skip locked
  )
  delete from public.v2_analytics_outbox outbox using candidates
  where outbox.request_event_id = candidates.request_event_id
    and outbox.status = 'complete' and outbox.updated_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;
revoke all on function private.prune_completed_analytics_outbox(integer) from public, anon, authenticated;
grant execute on function private.prune_completed_analytics_outbox(integer) to service_role;
comment on function private.prune_completed_analytics_outbox(integer) is
  'Bounded deletion of completed queue rows last updated more than seven days ago; preserves all usage sources and incomplete work.';
select cron.schedule('prune-completed-analytics-outbox', '* * * * *',
  $job$set statement_timeout = '10s'; set lock_timeout = '500ms'; select private.prune_completed_analytics_outbox(500);$job$);
