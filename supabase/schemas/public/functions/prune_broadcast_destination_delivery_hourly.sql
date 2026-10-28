CREATE OR REPLACE FUNCTION public.prune_broadcast_destination_delivery_hourly (
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
  -- The dashboard shows the last day; a week is kept for alerts and trends.
  with expired as (
    select destination_id, hour
    from public.broadcast_destination_delivery_hourly
    where hour < now() - interval '8 days'
    order by hour
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 5000), 5000))
  )
  delete from public.broadcast_destination_delivery_hourly hourly
  using expired
  where hourly.destination_id = expired.destination_id
    and hourly.hour = expired.hour;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) TO "service_role";

COMMENT ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) IS 'Deletes a bounded batch of Broadcast hourly delivery counts older than eight days.';

REVOKE ALL ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."prune_broadcast_destination_delivery_hourly"(integer) FROM PUBLIC, "anon", "authenticated";
