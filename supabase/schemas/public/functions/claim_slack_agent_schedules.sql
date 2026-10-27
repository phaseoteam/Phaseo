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
  -- the time this run was due, and its next_run_at moves on to its next local
  -- time at least 59 minutes later, so no schedule runs more than once an hour.
  -- Rows another claim holds are skipped, so a run is claimed once, whichever tick
  -- gets there first; run_at keys the run for the Worker's retries.
  -- A schedule whose installation isn't active (paused by an admin, or a charge
  -- unpaid) is paused with that reason instead, and while admins have turned
  -- recurring tasks off its runs are skipped. Neither is returned. Uninstalling
  -- deletes an installation's schedules (delete_slack_agent_schedules).
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
        next_run_at = public.slack_agent_schedule_next_run(
          schedule.frequency, schedule.hour, schedule.minute, schedule.day_of_week, schedule.day_of_month, schedule.timezone,
          greatest(now(), schedule.next_run_at + interval '59 minutes')
        ),
        status = case when installation.status = 'active' then 'active' else 'paused' end,
        pause_reason = case installation.status
          when 'active' then null
          when 'payment_due' then 'payment_due'
          else 'installation_paused'
        end,
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
      schedule.last_run_at, schedule.status, schedule.last_result
  )
  select claimed.id, claimed.installation_id, claimed.channel_id, claimed.title, claimed.prompt, claimed.created_by,
    claimed.frequency, claimed.hour, claimed.minute, claimed.day_of_week, claimed.day_of_month, claimed.timezone, claimed.last_run_at
  from claimed
  where claimed.status = 'active' and claimed.last_result is null
  order by claimed.last_run_at;
$function$;

COMMENT ON FUNCTION "public"."claim_slack_agent_schedules"(integer) IS 'For the Slack Worker''s cron trigger: claims due schedules once (FOR UPDATE SKIP LOCKED), moves each to its next local time at least 59 minutes on, pauses those of installations that aren''t active, skips them while recurring tasks are off, and returns the runs to start.';

GRANT EXECUTE ON FUNCTION "public"."claim_slack_agent_schedules"(integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."claim_slack_agent_schedules"(integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."claim_slack_agent_schedules"(integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_slack_agent_schedules"(integer) FROM PUBLIC, "anon", "authenticated";
