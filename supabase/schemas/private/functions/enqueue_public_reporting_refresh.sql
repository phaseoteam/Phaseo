CREATE OR REPLACE FUNCTION private.enqueue_public_reporting_refresh (
  p_occurred_at timestamp with time zone
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into private.public_reporting_refresh_queue as queue(report,bucket_start)
  select 'users_daily',(p_occurred_at at time zone 'utc')::date where p_occurred_at is not null and coalesce(current_setting('phaseo.pruning_byok_metadata', true), '') <> 'on'
  union all
  select 'workspaces_weekly',date_trunc('week',p_occurred_at at time zone 'utc')::date where p_occurred_at is not null and coalesce(current_setting('phaseo.pruning_byok_metadata', true), '') <> 'on'
  on conflict(report,bucket_start,signal_shard) do update
  set generation=excluded.generation,transaction_id=excluded.transaction_id,requested_at=excluded.requested_at
  -- At most one update per period per ingestion transaction. 64 lanes spread
  -- concurrent transactions instead of serializing all writes on two tuples.
  where queue.transaction_id<>excluded.transaction_id;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_public_reporting_refresh"(timestamp WITH time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_public_reporting_refresh"(timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_public_reporting_refresh"(timestamp WITH time zone) TO "postgres";
