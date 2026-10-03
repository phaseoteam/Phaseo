-- phaseo:allow-destructive-migration reason: preserves existing bounded BYOK metadata pruning and prevents it from erasing durable aggregate reports.
set local lock_timeout = '500ms';
set local statement_timeout = '10s';
-- phaseo:allow-destructive-migration reason: removes BYOK request-level metadata after the published 90-day access window; durable aggregate rollups remain

create or replace function public.prune_byok_request_metadata(
  p_retention_days integer default 90,
  p_batch_size integer default 10000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous_pruning text := current_setting('phaseo.pruning_byok_metadata', true);
  v_cutoff timestamptz;
  v_v2_deleted integer := 0;
  v_legacy_deleted integer := 0;
begin
  if p_retention_days < 90 or p_retention_days > 3650 then
    raise exception 'BYOK metadata retention must be between 90 and 3650 days';
  end if;
  if p_batch_size < 1 or p_batch_size > 50000 then
    raise exception 'BYOK metadata prune batch size must be between 1 and 50000';
  end if;

  v_cutoff := now() - make_interval(days => p_retention_days);

  perform set_config('phaseo.pruning_byok_metadata', 'on', true);
  with candidates as (
    select facts.request_event_id
    from public.v2_request_facts facts
    where (
        facts.byok is true
        or exists (
          select 1
          from public.v2_request_attempts attempt
          where attempt.request_event_id = facts.request_event_id
            and attempt.safe_metadata->>'key_source' = 'byok'
        )
      )
      and facts.occurred_at < v_cutoff
    order by facts.occurred_at, facts.request_event_id
    limit p_batch_size
  )
  delete from public.v2_request_facts facts
  using candidates
  where facts.request_event_id = candidates.request_event_id;
  get diagnostics v_v2_deleted = row_count;

  with candidates as (
    select requests.id, requests.created_at
    from public.gateway_requests requests
    where (
        requests.byok is true
        or exists (
          select 1
          from public.gateway_upstream_requests attempt
          where attempt.gateway_request_id = requests.id
            and attempt.gateway_request_created_at = requests.created_at
            and attempt.key_source = 'byok'
        )
      )
      and requests.created_at < v_cutoff
    order by requests.created_at, requests.id
    limit p_batch_size
  )
  delete from public.gateway_requests requests
  using candidates
  where requests.id = candidates.id
    and requests.created_at = candidates.created_at;
  get diagnostics v_legacy_deleted = row_count;

  perform set_config('phaseo.pruning_byok_metadata', coalesce(v_previous_pruning, ''), true);
  return jsonb_build_object(
    'cutoff', v_cutoff,
    'v2_deleted', v_v2_deleted,
    'legacy_deleted', v_legacy_deleted
  );
exception when others then
  perform set_config('phaseo.pruning_byok_metadata', coalesce(v_previous_pruning, ''), true);
  raise;
end;
$$;

revoke all on function public.prune_byok_request_metadata(integer, integer)
  from public, anon, authenticated;
grant execute on function public.prune_byok_request_metadata(integer, integer)
  to service_role;

comment on function public.prune_byok_request_metadata(integer, integer) is
  'Deletes bounded batches of BYOK request-level metadata older than 90 days or an explicitly longer operator-selected window. Child request facts are removed by cascade; aggregate rollups remain.';

create or replace function private.enqueue_public_reporting_refresh(p_occurred_at timestamptz)
returns void language sql security definer set search_path='' as $$
  insert into private.public_reporting_refresh_queue as queue(report,bucket_start)
  select 'users_daily',(p_occurred_at at time zone 'utc')::date where p_occurred_at is not null and coalesce(current_setting('phaseo.pruning_byok_metadata', true), '') <> 'on'
  union all
  select 'workspaces_weekly',date_trunc('week',p_occurred_at at time zone 'utc')::date where p_occurred_at is not null and coalesce(current_setting('phaseo.pruning_byok_metadata', true), '') <> 'on'
  on conflict(report,bucket_start,signal_shard) do update
  set generation=excluded.generation,transaction_id=excluded.transaction_id,requested_at=excluded.requested_at
  -- At most one update per period per ingestion transaction. 64 lanes spread
  -- concurrent transactions instead of serializing all writes on two tuples.
  where queue.transaction_id<>excluded.transaction_id;
$$;
-- The worker captures at most 64 generation IDs per period. Matching exact
-- generations preserves commits arriving during its source scan, including
-- transactions whose sequence values were allocated earlier. Backoff stays
-- worker-owned, and newly arriving signals cannot defeat it.
create or replace function private.enqueue_v2_analytics_correction(p_request_event_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.v2_analytics_outbox as outbox
    (request_event_id,workspace_id,occurred_at,status,attempt_count,available_at,last_error,updated_at)
  select request_event_id,workspace_id,occurred_at,'pending',0,now(),null,now()
  from public.v2_request_facts where request_event_id=p_request_event_id and coalesce(current_setting('phaseo.pruning_byok_metadata', true), '') <> 'on'
  on conflict(request_event_id) do update set workspace_id=excluded.workspace_id,
    occurred_at=excluded.occurred_at,status='pending',attempt_count=0,
    available_at=now(),last_error=null,updated_at=now()
  where outbox.status<>'pending' or outbox.workspace_id is distinct from excluded.workspace_id
    or outbox.occurred_at is distinct from excluded.occurred_at;
$$;
revoke all on function private.enqueue_v2_analytics_correction(uuid) from public,anon,authenticated,service_role;
