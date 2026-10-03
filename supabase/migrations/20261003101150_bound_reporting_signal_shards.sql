-- phaseo:allow-destructive-migration reason: Coalesces duplicate dirty signals only; source facts and reporting results are preserved.
set local lock_timeout='500ms';
set local statement_timeout='10s';
alter table private.public_reporting_refresh_queue add column signal_shard integer;
update private.public_reporting_refresh_queue set signal_shard=mod(transaction_id,64)::integer;
alter table private.public_reporting_refresh_queue alter column signal_shard set not null;
alter table private.public_reporting_refresh_queue alter column signal_shard set default mod(txid_current(),64)::integer;
alter table private.public_reporting_refresh_queue add constraint public_reporting_signal_shard_check check(signal_shard>=0 and signal_shard<64);
delete from private.public_reporting_refresh_queue q using (
  select generation,row_number() over(partition by report,bucket_start,signal_shard order by generation desc) position
  from private.public_reporting_refresh_queue
) duplicates where q.generation=duplicates.generation and duplicates.position>1;
create unique index public_reporting_refresh_shard_idx
  on private.public_reporting_refresh_queue(report,bucket_start,signal_shard);
drop index private.public_reporting_refresh_transaction_idx;

create or replace function private.enqueue_public_reporting_refresh(p_occurred_at timestamptz)
returns void language sql security definer set search_path='' as $$
  insert into private.public_reporting_refresh_queue as queue(report,bucket_start)
  select 'users_daily',(p_occurred_at at time zone 'utc')::date where p_occurred_at is not null
  union all
  select 'workspaces_weekly',date_trunc('week',p_occurred_at at time zone 'utc')::date where p_occurred_at is not null
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
comment on table private.public_reporting_refresh_queue is
  'Dirty UTC periods with 64 transaction lanes each; repeated meters coalesce; one period per five minutes, ten-second run cap, two-hour failed-run backoff.';
