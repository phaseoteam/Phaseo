CREATE OR REPLACE FUNCTION private.spend_report_due_workspaces (
  p_now timestamp with time zone
)
  RETURNS TABLE (
    workspace_id   uuid,
    owner_user_id  uuid,
    cadence        text,
    include_admins boolean,
    time_zone      text,
    period_start   timestamp with time zone,
    period_end     timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Workspaces whose spend report is due at p_now (private.spend_report_period in their
  -- billing_time_zone) and has not been handled for that period yet (workspace_spend_report_runs).
  -- A workspace without settings uses the defaults: weekly, owners only, UTC. Periods are worked
  -- out once per cadence and zone in use, not per workspace, so an idle tick is one pass over
  -- workspaces with a hash join.
  with settings as materialized (
    select
      workspace.id,
      workspace.owner_user_id,
      coalesce(stored.spend_report_cadence, 'weekly') as cadence,
      coalesce(stored.spend_report_include_admins, false) as include_admins,
      coalesce(stored.billing_time_zone, 'UTC') as time_zone
    from public.workspaces workspace
    left join public.workspace_settings stored on stored.workspace_id = workspace.id
  ),
  due as materialized (
    select zone.cadence, zone.time_zone, report.period_start, report.period_end
    from (select distinct settings.cadence, settings.time_zone from settings where settings.cadence <> 'off') zone
    cross join lateral private.spend_report_period(zone.cadence, zone.time_zone, p_now) report
    where report.due
  )
  select settings.id, settings.owner_user_id, settings.cadence, settings.include_admins, settings.time_zone,
    due.period_start, due.period_end
  from settings
  join due on due.cadence = settings.cadence and due.time_zone = settings.time_zone
  left join public.workspace_spend_report_runs run
    on run.workspace_id = settings.id and run.cadence = settings.cadence
  where run.period_start is null or run.period_start < due.period_start;
$function$;

COMMENT ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) IS 'Workspaces whose daily, weekly or monthly spend report is due at p_now in their billing_time_zone and not yet handled for that period.';

REVOKE ALL ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."spend_report_due_workspaces"(timestamp with time zone) TO "service_role";
