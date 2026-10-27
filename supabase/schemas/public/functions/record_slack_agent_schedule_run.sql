CREATE OR REPLACE FUNCTION public.record_slack_agent_schedule_run (
  p_schedule_id uuid,
  p_run_at      timestamp with time zone,
  p_result      text,
  p_reason      text,
  p_pause       boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- What became of a claimed run, reported by the Slack Worker when its answer
-- ends or when it skips the run. answered clears the failures in a row; failed
-- and skipped add one. p_pause pauses the schedule at once, with p_reason as the
-- reason (its creator can no longer use the agent, or the agent isn't in the
-- channel); otherwise the third failure in a row pauses it (failures). Only the
-- run claimed last is recorded, and only once: a repeat (a retried Workflow
-- step) or an older run changes nothing and returns recorded false.
-- Returns {recorded, paused (by this call), pause_reason, failures, created_by,
-- channel_id, title}. Service role only.
declare
  v_schedule public.slack_agent_schedules%rowtype;
  v_failures integer;
  v_pause text;
begin
  if p_result is null or p_result not in ('answered', 'failed', 'skipped') then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  select * into v_schedule
  from public.slack_agent_schedules schedule
  where schedule.id = p_schedule_id and schedule.last_run_at = p_run_at and schedule.last_result is null
  for update;
  if not found then
    return jsonb_build_object('recorded', false, 'paused', false);
  end if;
  v_failures := case when p_result = 'answered' then 0 else v_schedule.failures + 1 end;
  -- One an admin paused meanwhile keeps that reason.
  v_pause := case
    when v_schedule.status <> 'active' then null
    when coalesce(p_pause, false) then p_reason
    when v_failures >= 3 then 'failures'
  end;
  update public.slack_agent_schedules schedule
  set last_result = p_result,
      last_result_reason = p_reason,
      failures = v_failures,
      status = case when v_pause is null then schedule.status else 'paused' end,
      pause_reason = coalesce(v_pause, schedule.pause_reason)
  where schedule.id = p_schedule_id;
  return jsonb_build_object(
    'recorded', true,
    'paused', v_pause is not null,
    'pause_reason', v_pause,
    'failures', v_failures,
    'created_by', v_schedule.created_by,
    'channel_id', v_schedule.channel_id,
    'title', v_schedule.title
  );
end;
$function$;

COMMENT ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) IS 'For the Slack Worker: records the result of a schedule''s latest claimed run once, counts failures in a row and pauses the schedule when asked or at the third. Returns {recorded, paused, pause_reason, failures, created_by, channel_id, title}.';

GRANT EXECUTE ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) FROM PUBLIC, "anon", "authenticated";
