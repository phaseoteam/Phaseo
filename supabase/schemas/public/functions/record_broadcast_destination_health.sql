CREATE OR REPLACE FUNCTION public.record_broadcast_destination_health (
  p_results jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '5s'
  SET lock_timeout TO '1s'
  AS $function$
declare
  v_recorded integer;
begin
  -- One entry per destination from one consumer batch: events delivered and
  -- finally failed, failed requests since the batch's last success, and the
  -- last success and failure. A batch with a success resets the failure streak
  -- to its own count; otherwise its failures extend the stored streak.
  -- Destinations deleted since delivery are skipped.
  with results as (
    select distinct on (result.destination_id)
      result.destination_id,
      destination.workspace_id,
      greatest(coalesce(result.delivered, 0), 0) as delivered,
      greatest(coalesce(result.failed, 0), 0) as failed,
      greatest(coalesce(result.failures, 0), 0) as failures,
      result.last_success_at,
      result.last_failure_at,
      result.last_http_status,
      left(result.last_error, 500) as last_error
    from jsonb_to_recordset(case when jsonb_typeof(p_results) = 'array' then p_results else '[]'::jsonb end) as result(
      destination_id uuid,
      delivered integer,
      failed integer,
      failures integer,
      last_success_at timestamptz,
      last_failure_at timestamptz,
      last_http_status integer,
      last_error text
    )
    join public.workspace_broadcast_destinations destination on destination.id = result.destination_id
    order by result.destination_id
  ),
  health as (
    insert into public.broadcast_destination_health as health (
      destination_id, workspace_id, last_success_at, last_failure_at, last_http_status, last_error, consecutive_failures, updated_at
    )
    select destination_id, workspace_id, last_success_at, last_failure_at, last_http_status, last_error, failures, now()
    from results
    where last_success_at is not null or last_failure_at is not null
    on conflict (destination_id) do update set
      last_success_at = greatest(health.last_success_at, excluded.last_success_at),
      last_failure_at = greatest(health.last_failure_at, excluded.last_failure_at),
      last_http_status = case when excluded.last_failure_at is not null then excluded.last_http_status else health.last_http_status end,
      last_error = case when excluded.last_failure_at is not null then excluded.last_error else health.last_error end,
      consecutive_failures = case
        when excluded.last_success_at is not null then excluded.consecutive_failures
        else health.consecutive_failures + excluded.consecutive_failures
      end,
      updated_at = now()
  ),
  hourly as (
    insert into public.broadcast_destination_delivery_hourly as hourly (destination_id, hour, workspace_id, delivered, failed)
    select destination_id, date_trunc('hour', now(), 'UTC'), workspace_id, delivered, failed
    from results
    where delivered > 0 or failed > 0
    on conflict (destination_id, hour) do update set
      delivered = hourly.delivered + excluded.delivered,
      failed = hourly.failed + excluded.failed
  )
  select count(*) into v_recorded from results;
  return v_recorded;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) TO "service_role";

COMMENT ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) IS 'Records one Broadcast consumer batch''s delivery outcomes per destination: the latest success and failure, the failure streak, and hourly delivered and failed event counts.';

REVOKE ALL ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_broadcast_destination_health"(jsonb) FROM PUBLIC, "anon", "authenticated";
