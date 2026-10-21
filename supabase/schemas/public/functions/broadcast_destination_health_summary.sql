CREATE OR REPLACE FUNCTION public.broadcast_destination_health_summary (
  p_workspace_id uuid
)
  RETURNS TABLE (
    destination_id uuid,
    last_success_at timestamp with time zone,
    last_failure_at timestamp with time zone,
    last_http_status integer,
    last_error text,
    consecutive_failures integer,
    delivered_24h bigint,
    failed_24h bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '5s'
  AS $function$
  -- The 24-hour window covers the current UTC hour and the 24 before it, so it
  -- spans up to 25 hours rather than dropping the hour in progress.
  select
    destination.id,
    health.last_success_at,
    health.last_failure_at,
    health.last_http_status,
    health.last_error,
    coalesce(health.consecutive_failures, 0),
    coalesce(counts.delivered, 0),
    coalesce(counts.failed, 0)
  from public.workspace_broadcast_destinations destination
  left join public.broadcast_destination_health health on health.destination_id = destination.id
  left join (
    select hourly.destination_id, sum(hourly.delivered) as delivered, sum(hourly.failed) as failed
    from public.broadcast_destination_delivery_hourly hourly
    where hourly.workspace_id = p_workspace_id
      and hourly.hour >= date_trunc('hour', now(), 'UTC') - interval '24 hours'
    group by hourly.destination_id
  ) counts on counts.destination_id = destination.id
  where destination.workspace_id = p_workspace_id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) TO "service_role";

COMMENT ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) IS 'Each Broadcast destination in a workspace with its latest delivery outcome, failure streak, and events delivered and failed in the last 24 hours.';

REVOKE ALL ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."broadcast_destination_health_summary"(uuid) FROM PUBLIC, "anon", "authenticated";
