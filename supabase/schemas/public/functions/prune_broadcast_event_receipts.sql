CREATE OR REPLACE FUNCTION public.prune_broadcast_event_receipts (
  p_limit integer DEFAULT 5000
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '10s'
  SET lock_timeout TO '500ms'
  AS $function$
declare
  v_deleted integer;
begin
  -- Repeat emissions arrive within minutes. Five days outlasts the queue's
  -- default four-day message retention, so no queued message outlives its receipt.
  with expired as (
    select event_id
    from public.broadcast_event_receipts
    where received_at < now() - interval '5 days'
    order by received_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5000), 5000))
  )
  delete from public.broadcast_event_receipts receipts
  using expired
  where receipts.event_id = expired.event_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) TO "service_role";

COMMENT ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) IS 'Deletes a bounded batch of Broadcast event receipts older than five days.';

REVOKE ALL ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."prune_broadcast_event_receipts"(integer) FROM PUBLIC, "anon", "authenticated";
