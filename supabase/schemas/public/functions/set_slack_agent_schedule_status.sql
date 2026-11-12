CREATE OR REPLACE FUNCTION public.set_slack_agent_schedule_status (
  p_installation_id uuid,
  p_schedule_id     uuid,
  p_status          text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Settings > Slack: an owner or admin pauses or resumes one of the
-- installation's schedules (web-api checks who they are). Pausing records the
-- reason admin. Resuming clears the reason and the failures in a row, and the
-- schedule next runs at its next local time after now, and at least 50 minutes
-- after its last run was claimed, so resuming can't make it run more than once
-- an hour.
-- Returns the schedule without its installation id, or null when the
-- installation has no such schedule. Service role only.
declare
  v_schedule public.slack_agent_schedules%rowtype;
begin
  if p_status is null or p_status not in ('active', 'paused') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.slack_agent_schedules schedule
  set status = p_status,
      pause_reason = case when p_status = 'paused' then coalesce(case when schedule.status = 'paused' then schedule.pause_reason end, 'admin') end,
      failures = case when p_status = 'active' and schedule.status <> 'active' then 0 else schedule.failures end,
      next_run_at = case
        when p_status = 'active' and schedule.status <> 'active' then public.slack_agent_schedule_next_run(
          schedule.frequency, schedule.hour, schedule.minute, schedule.day_of_week, schedule.day_of_month, schedule.timezone,
          greatest(now(), schedule.last_claimed_at + interval '50 minutes')
        )
        else schedule.next_run_at
      end
  where schedule.id = p_schedule_id and schedule.installation_id = p_installation_id
  returning * into v_schedule;
  if not found then
    return null;
  end if;
  return to_jsonb(v_schedule) - 'installation_id';
end;
$function$;

COMMENT ON FUNCTION "public"."set_slack_agent_schedule_status"(uuid, uuid, text) IS 'For web-api (Settings > Slack): pauses (reason admin) or resumes a schedule. Resuming clears failures and moves next_run_at to its next local time at least 50 minutes after its last run was claimed. Returns the schedule, or null.';

GRANT EXECUTE ON FUNCTION "public"."set_slack_agent_schedule_status"(uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_slack_agent_schedule_status"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_slack_agent_schedule_status"(uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_slack_agent_schedule_status"(uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";
