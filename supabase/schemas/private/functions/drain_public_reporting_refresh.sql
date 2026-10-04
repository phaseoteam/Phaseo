CREATE OR REPLACE FUNCTION private.drain_public_reporting_refresh()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "private"."drain_public_reporting_refresh"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."drain_public_reporting_refresh"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."drain_public_reporting_refresh"() TO "postgres";
