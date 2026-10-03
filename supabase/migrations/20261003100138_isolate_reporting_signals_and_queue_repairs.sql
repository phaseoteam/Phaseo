-- phaseo:allow-destructive-migration reason: Replaces the reporting queue key and worker acknowledgment only; source facts and existing reports are preserved.
set local lock_timeout = '500ms';
set local statement_timeout = '10s';
alter table private.public_reporting_refresh_queue
  add column transaction_id bigint not null default txid_current();
alter table private.public_reporting_refresh_queue drop constraint public_reporting_refresh_queue_pkey;
alter table private.public_reporting_refresh_queue add primary key (generation);
create unique index public_reporting_refresh_transaction_idx
  on private.public_reporting_refresh_queue(report,bucket_start,transaction_id);
create table private.public_reporting_refresh_backoff (
  report text not null, bucket_start date not null, retry_after timestamptz not null,
  last_error_code text not null, primary key(report,bucket_start)
);
alter table private.public_reporting_refresh_backoff enable row level security;
revoke all on private.public_reporting_refresh_backoff from public,anon,authenticated,service_role;

create or replace function private.enqueue_public_reporting_refresh(p_occurred_at timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.public_reporting_refresh_queue(report,bucket_start)
  select 'users_daily',(p_occurred_at at time zone 'utc')::date where p_occurred_at is not null
  union all
  select 'workspaces_weekly',date_trunc('week',p_occurred_at at time zone 'utc')::date where p_occurred_at is not null
  -- Only source rows in the SAME transaction share a unique key. Concurrent
  -- ingestions append independent rows instead of rewriting two global tuples.
  on conflict(report,bucket_start,transaction_id) do nothing;
$$;

create or replace function private.drain_public_reporting_refresh()
returns integer language plpgsql security definer set search_path = '' as $$
declare item record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('public-reporting-refresh-worker',0)) then return 0; end if;
  select q.report,q.bucket_start,array_agg(q.generation) as generations into item
  from private.public_reporting_refresh_queue q
  where not exists(select 1 from private.public_reporting_refresh_backoff b
    where b.report=q.report and b.bucket_start=q.bucket_start and b.retry_after>clock_timestamp())
  group by q.report,q.bucket_start order by min(q.requested_at),q.report,q.bucket_start limit 1;
  if not found then return 0; end if;
  begin
    if item.report='users_daily' then
      perform public.refresh_public_model_user_usage_daily(
        item.bucket_start::timestamp at time zone 'utc',(item.bucket_start+1)::timestamp at time zone 'utc');
    else
      perform public.refresh_public_model_workspace_usage_weekly(
        item.bucket_start::timestamp at time zone 'utc',(item.bucket_start+7)::timestamp at time zone 'utc');
    end if;
  exception when query_canceled or lock_not_available or others then
    insert into private.public_reporting_refresh_backoff values
      (item.report,item.bucket_start,clock_timestamp()+interval '2 hours',sqlstate)
    on conflict(report,bucket_start) do update set retry_after=excluded.retry_after,last_error_code=excluded.last_error_code;
    update private.public_reporting_refresh_queue
    set retry_after=clock_timestamp()+interval '2 hours',last_error_code=sqlstate
    where generation=any(item.generations);
    return 0;
  end;
  -- Capture exact visible IDs, not a sequence cutoff: an older sequence value
  -- can belong to a transaction that commits AFTER the source scan.
  delete from private.public_reporting_refresh_queue where generation=any(item.generations);
  delete from private.public_reporting_refresh_backoff where report=item.report and bucket_start=item.bucket_start;
  return 1;
end;
$$;

-- Direct fact/meter corrections previously relied on a daily 90-day replay.
-- Mark their request in the existing bounded worker's outbox instead.
create function private.enqueue_v2_analytics_correction(p_request_event_id uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.v2_analytics_outbox as outbox
    (request_event_id,workspace_id,occurred_at,status,attempt_count,available_at,last_error,updated_at)
  select request_event_id,workspace_id,occurred_at,'pending',0,now(),null,now()
  from public.v2_request_facts where request_event_id=p_request_event_id
  on conflict(request_event_id) do update set workspace_id=excluded.workspace_id,
    occurred_at=excluded.occurred_at,status='pending',attempt_count=0,
    available_at=now(),last_error=null,updated_at=now()
  where outbox.status<>'pending' or outbox.workspace_id is distinct from excluded.workspace_id
    or outbox.occurred_at is distinct from excluded.occurred_at;
$$;
revoke all on function private.enqueue_v2_analytics_correction(uuid) from public,anon,authenticated,service_role;
create function private.enqueue_v2_analytics_fact_correction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old is distinct from new then perform private.enqueue_v2_analytics_correction(new.request_event_id); end if;
  return new;
end;
$$;
revoke all on function private.enqueue_v2_analytics_fact_correction() from public,anon,authenticated,service_role;
create trigger v2_request_facts_analytics_correction after update on public.v2_request_facts
for each row execute function private.enqueue_v2_analytics_fact_correction();
create function private.enqueue_v2_analytics_meter_correction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op<>'INSERT' then perform private.enqueue_v2_analytics_correction(old.request_event_id); end if;
  if tg_op<>'DELETE' then
    if tg_op='INSERT' or new.request_event_id is distinct from old.request_event_id then
      perform private.enqueue_v2_analytics_correction(new.request_event_id);
    end if;
    return new;
  end if;
  return old;
end;
$$;
revoke all on function private.enqueue_v2_analytics_meter_correction() from public,anon,authenticated,service_role;
create trigger v2_request_usage_analytics_correction after insert or update or delete on public.v2_request_usage
for each row execute function private.enqueue_v2_analytics_meter_correction();
comment on table private.public_reporting_refresh_queue is
  'Independent per-transaction dirty UTC periods; one period per five minutes; exact visible signal acknowledgments.';
