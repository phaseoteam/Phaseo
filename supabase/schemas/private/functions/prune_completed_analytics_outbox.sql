CREATE OR REPLACE FUNCTION private.prune_completed_analytics_outbox (
  p_batch_size integer DEFAULT 500
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '10s'
  SET lock_timeout TO '500ms'
  AS $function$
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

GRANT EXECUTE ON FUNCTION "private"."prune_completed_analytics_outbox"(integer) TO "service_role";

COMMENT ON FUNCTION "private"."prune_completed_analytics_outbox"(integer) IS 'Bounded deletion of completed queue rows last updated more than seven days ago; preserves all usage sources and incomplete work.';

REVOKE ALL ON FUNCTION "private"."prune_completed_analytics_outbox"(integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."prune_completed_analytics_outbox"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."prune_completed_analytics_outbox"(integer) TO "postgres";
