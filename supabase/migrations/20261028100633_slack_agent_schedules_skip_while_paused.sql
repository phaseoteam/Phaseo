-- Slack agent: recurring tasks skip their runs while the agent is paused or a
-- bill is due, and carry on by themselves afterwards.
-- * claim_slack_agent_schedules: a due run of an installation that isn't active
--   (paused by an admin, or a charge unpaid) is recorded as skipped with that
--   reason (installation_paused, payment_due) and the schedule moves on to its
--   next time. It no longer pauses the schedule.
-- * record_slack_agent_schedule_run: a run the Worker skipped for those reasons
--   neither pauses the schedule nor counts toward the 3 failures in a row, also
--   when a Worker deployed before this still asks for a pause.
-- * slack_agent_schedules.failures: its comment says which skipped runs count.
-- * Schedules these paused before are active again, as Resume in Settings > Slack
--   makes them: no pause reason, no failures in a row, and their next run at their
--   next local time at least 50 minutes after their last run was claimed. Those
--   of an installation that's still paused or has a bill due skip their runs (as
--   above) until it's active, then run at their next time. Nothing is deleted.

SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.claim_slack_agent_schedules (
  p_limit integer
)
  RETURNS TABLE (
    schedule_id     uuid,
    installation_id uuid,
    channel_id      text,
    title           text,
    prompt          text,
    created_by      text,
    frequency       text,
    hour            smallint,
    minute          smallint,
    day_of_week     smallint,
    day_of_month    smallint,
    timezone        text,
    run_at          timestamp with time zone
  )
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The Slack Worker's cron trigger calls this every minute: it claims the active
  -- schedules that are due, oldest first, at most p_limit (1 to 200, default 50),
  -- through the partial index on next_run_at. A claimed row's last_run_at becomes
  -- the time this run was due and last_claimed_at the time it was claimed, and
  -- its next_run_at moves on to its next local time at least 50 minutes after the
  -- claim, so no schedule runs more than once an hour, even when a run is claimed
  -- late. Rows another claim holds are skipped, so a run is claimed once,
  -- whichever tick gets there first; run_at keys the run for the Worker's retries.
  -- While a schedule's installation isn't active (paused by an admin, or a charge
  -- unpaid) its runs are skipped with that reason, and so are all runs while
  -- admins have turned recurring tasks off. A skipped run isn't returned; the
  -- schedule stays active with its failures in a row as they were, and runs again
  -- at its next time once the agent is back on. Uninstalling deletes an
  -- installation's schedules (delete_slack_agent_schedules).
  -- Service role only.
  with due as (
    select schedule.id
    from public.slack_agent_schedules schedule
    where schedule.status = 'active' and schedule.next_run_at <= now()
    order by schedule.next_run_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), claimed as (
    update public.slack_agent_schedules schedule
    set last_run_at = schedule.next_run_at,
        last_claimed_at = now(),
        next_run_at = public.slack_agent_schedule_next_run(
          schedule.frequency, schedule.hour, schedule.minute, schedule.day_of_week, schedule.day_of_month, schedule.timezone,
          now() + interval '50 minutes'
        ),
        last_result = case when installation.status <> 'active' or not installation.schedules_enabled then 'skipped' end,
        last_result_reason = case
          when installation.status = 'payment_due' then 'payment_due'
          when installation.status <> 'active' then 'installation_paused'
          when not installation.schedules_enabled then 'schedules_off'
        end
    from due, public.slack_installations installation
    where schedule.id = due.id and installation.id = schedule.installation_id
    returning schedule.id, schedule.installation_id, schedule.channel_id, schedule.title, schedule.prompt, schedule.created_by,
      schedule.frequency, schedule.hour, schedule.minute, schedule.day_of_week, schedule.day_of_month, schedule.timezone,
      schedule.last_run_at, schedule.last_result
  )
  select claimed.id, claimed.installation_id, claimed.channel_id, claimed.title, claimed.prompt, claimed.created_by,
    claimed.frequency, claimed.hour, claimed.minute, claimed.day_of_week, claimed.day_of_month, claimed.timezone, claimed.last_run_at
  from claimed
  where claimed.last_result is null
  order by claimed.last_run_at;
$function$;

COMMENT ON FUNCTION "public"."claim_slack_agent_schedules"(integer) IS 'For the Slack Worker''s cron trigger: claims due schedules once (FOR UPDATE SKIP LOCKED), moves each to its next local time at least 50 minutes after the claim, skips (without pausing them) those of installations that aren''t active and all of them while recurring tasks are off, and returns the runs to start.';

GRANT EXECUTE ON FUNCTION "public"."claim_slack_agent_schedules"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_slack_agent_schedules"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_slack_agent_schedules"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_slack_agent_schedules"(integer) FROM PUBLIC, "anon", "authenticated";

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
-- channel); otherwise the third failure in a row pauses it (failures). A run
-- skipped because the agent is paused or a bill is due (installation_paused,
-- payment_due) is neither: it leaves the failures in a row as they were and never
-- pauses the schedule, even with p_pause, so the schedule runs again at its next
-- time once the agent is back on. Only the run claimed last is recorded, and
-- only once: a repeat (a retried Workflow step) or an older run changes nothing
-- and returns recorded false.
-- Returns {recorded, paused (by this call), pause_reason, failures, created_by,
-- channel_id, title}. Service role only.
declare
  v_schedule public.slack_agent_schedules%rowtype;
  v_failures integer;
  v_pause text;
  v_agent_paused boolean := p_result = 'skipped' and coalesce(p_reason in ('installation_paused', 'payment_due'), false);
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
  v_failures := case
    when p_result = 'answered' then 0
    when v_agent_paused then v_schedule.failures
    else v_schedule.failures + 1
  end;
  -- One an admin paused meanwhile keeps that reason.
  v_pause := case
    when v_schedule.status <> 'active' or v_agent_paused then null
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

COMMENT ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) IS 'For the Slack Worker: records the result of a schedule''s latest claimed run once, counts failures in a row and pauses the schedule when asked or at the third; a run skipped while the agent is paused or a bill is due neither counts nor pauses it. Returns {recorded, paused, pause_reason, failures, created_by, channel_id, title}.';

GRANT EXECUTE ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_slack_agent_schedule_run"(uuid, timestamp with time zone, text, text, boolean) FROM PUBLIC, "anon", "authenticated";

COMMENT ON COLUMN "public"."slack_agent_schedules"."failures" IS 'Runs in a row that failed or were skipped, apart from runs skipped while the agent was paused, a bill was due or recurring tasks were off, which leave it as it was. The third pauses the schedule (pause_reason failures) and the creator is told privately.';

UPDATE public.slack_agent_schedules schedule
SET status = 'active',
    pause_reason = null,
    failures = 0,
    next_run_at = public.slack_agent_schedule_next_run(
      schedule.frequency, schedule.hour, schedule.minute, schedule.day_of_week, schedule.day_of_month, schedule.timezone,
      greatest(now(), schedule.last_claimed_at + interval '50 minutes')
    )
FROM public.slack_installations installation
WHERE installation.id = schedule.installation_id
  AND installation.status <> 'uninstalled'
  AND schedule.status = 'paused'
  AND schedule.pause_reason IN ('installation_paused', 'payment_due');
