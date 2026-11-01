CREATE OR REPLACE FUNCTION private.connect_days_on (
  p_workspace_id uuid,
  p_from         date,
  p_to           date
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- UTC days in [p_from, p_to) on which Connect was on at any moment. A period
  -- that ends exactly at midnight does not reach into the next day.
  select count(*)::integer
  from generate_series(p_from::timestamp, (p_to - 1)::timestamp, interval '1 day') as day (day_start)
  where exists (
    select 1 from public.connect_subscription_periods period
    where period.workspace_id = p_workspace_id
      and period.started_at < ((day.day_start + interval '1 day') at time zone 'utc')
      and (period.ended_at is null or period.ended_at > (day.day_start at time zone 'utc'))
  );
$function$;

COMMENT ON FUNCTION "private"."connect_days_on"(uuid, date, date) IS 'The UTC days from p_from up to (not including) p_to on which Phaseo Connect was on at any moment for the workspace, from connect_subscription_periods.';

REVOKE ALL ON FUNCTION "private"."connect_days_on"(uuid, date, date) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."connect_days_on"(uuid, date, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."connect_days_on"(uuid, date, date) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."connect_days_on"(uuid, date, date) TO "service_role";
