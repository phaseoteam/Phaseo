-- phaseo:allow-destructive-migration reason: the DELETEs are inside the new Slack agent schedule functions: cancel_slack_agent_schedule deletes the one schedule its creator (or a linked workspace owner or admin) asks the agent to cancel, and the delete_slack_agent_schedules trigger deletes an installation's schedules when it is uninstalled. The migration deletes no existing data.

-- Phaseo Slack agent: recurring tasks (schedules).
-- * slack_agent_schedules: a self-contained prompt the agent answers in one conversation, hourly, daily, on
--   weekdays, weekly or monthly at a local time in the creator's Slack time zone. Service role only, like the
--   other slack_* tables; inserts only through save_slack_agent_schedule, which enforces the per-installation
--   maximum, the admins' switch and who may create them, and saves once per tool call (creation_key).
--   Hourly is the finest frequency.
-- * claim_slack_agent_schedules: the Worker's cron trigger (every minute) claims due rows once with
--   FOR UPDATE SKIP LOCKED through a partial index, and moves each to its next run at least 50 minutes
--   after the claim (last_claimed_at).
-- * record_slack_agent_schedule_run, cancel_slack_agent_schedule and set_slack_agent_schedule_status for the
--   Worker's runs and tools and for Settings > Slack.
-- * slack_installations: schedules_enabled (on), schedules_max (20) and schedule_creators (everyone).
-- * Marking an installation uninstalled, by either path, deletes its schedules in the same transaction.

SET local check_function_bodies = off;

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "schedules_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "schedules_max" integer NOT NULL DEFAULT 20;

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "schedule_creators" text NOT NULL DEFAULT 'everyone'::text;

ALTER TABLE "public"."slack_installations"
  ADD CONSTRAINT "slack_installations_schedule_creators_check" CHECK ((schedule_creators = ANY (ARRAY['everyone'::text, 'linked'::text])));

ALTER TABLE "public"."slack_installations"
  ADD CONSTRAINT "slack_installations_schedules_max_check" CHECK (((schedules_max >= 1) AND (schedules_max <= 100)));

COMMENT ON COLUMN "public"."slack_installations"."schedules_enabled" IS 'Whether people may set up recurring tasks (schedules) with the agent, and whether they run (on by default). While off, no schedule is saved and due runs are skipped; saved schedules are kept.';

COMMENT ON COLUMN "public"."slack_installations"."schedules_max" IS 'The most schedules the installation keeps, 1 to 100 (20 by default). save_slack_agent_schedule refuses one more; lowering it keeps the ones saved.';

COMMENT ON COLUMN "public"."slack_installations"."schedule_creators" IS 'Who may set up schedules: everyone (default), anyone the agent answers; or linked, only people who linked their Phaseo account.';

CREATE TABLE "public"."slack_agent_schedules" (
  "id"                 uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "installation_id"    uuid                     NOT NULL,
  "channel_id"         text                     NOT NULL,
  "title"              text                     NOT NULL,
  "prompt"             text                     NOT NULL,
  "frequency"          text                     NOT NULL,
  "hour"               smallint,
  "minute"             smallint                 NOT NULL,
  "day_of_week"        smallint,
  "day_of_month"       smallint,
  "timezone"           text                     NOT NULL,
  "created_by"         text                     NOT NULL,
  "creation_key"       text                     NOT NULL,
  "status"             text                     NOT NULL DEFAULT 'active'::text,
  "pause_reason"       text,
  "next_run_at"        timestamp with time zone NOT NULL,
  "last_run_at"        timestamp with time zone,
  "last_claimed_at"    timestamp with time zone,
  "last_result"        text,
  "last_result_reason" text,
  "failures"           smallint                 NOT NULL DEFAULT 0,
  "created_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_agent_schedules_channel_id_check" CHECK ((channel_id ~ '^[CDG][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_agent_schedules_created_by_check" CHECK ((created_by ~ '^[UW][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_agent_schedules_creation_key_check" CHECK (((char_length(creation_key) >= 1) AND (char_length(creation_key) <= 200))),
  CONSTRAINT "slack_agent_schedules_day_of_month_check" CHECK ((((frequency = 'monthly'::text) AND (day_of_month IS NOT NULL) AND (day_of_month >= 1) AND (day_of_month <= 31)) OR ((frequency <> 'monthly'::text) AND (day_of_month IS NULL)))),
  CONSTRAINT "slack_agent_schedules_day_of_week_check" CHECK ((((frequency = 'weekly'::text) AND (day_of_week IS NOT NULL) AND (day_of_week >= 1) AND (day_of_week <= 7)) OR ((frequency <> 'weekly'::text) AND (day_of_week IS NULL)))),
  CONSTRAINT "slack_agent_schedules_failures_check" CHECK ((failures >= 0)),
  CONSTRAINT "slack_agent_schedules_frequency_check" CHECK ((frequency = ANY (ARRAY['hourly'::text, 'daily'::text, 'weekdays'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "slack_agent_schedules_hour_check" CHECK ((((frequency = 'hourly'::text) AND (hour IS NULL)) OR ((frequency <> 'hourly'::text) AND (hour IS NOT NULL) AND (hour >= 0) AND (hour <= 23)))),
  CONSTRAINT "slack_agent_schedules_installation_id_creation_key_key" UNIQUE (installation_id, creation_key),
  CONSTRAINT "slack_agent_schedules_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_schedules_last_result_check" CHECK (((last_result IS NULL) OR (last_result = ANY (ARRAY['answered'::text, 'failed'::text, 'skipped'::text])))),
  CONSTRAINT "slack_agent_schedules_last_result_reason_check" CHECK (((last_result_reason IS NULL) OR (last_result_reason ~ '^[a-z_]{1,40}$'::text))),
  CONSTRAINT "slack_agent_schedules_minute_check" CHECK (((minute >= 0) AND (minute <= 59))),
  CONSTRAINT "slack_agent_schedules_pause_reason_check" CHECK ((((status = 'active'::text) AND (pause_reason IS NULL)) OR ((status = 'paused'::text) AND (pause_reason = ANY (ARRAY['admin'::text, 'creator_access'::text, 'not_in_channel'::text, 'installation_paused'::text, 'payment_due'::text, 'failures'::text]))))),
  CONSTRAINT "slack_agent_schedules_pkey" PRIMARY KEY (id),
  CONSTRAINT "slack_agent_schedules_prompt_check" CHECK (((char_length(prompt) >= 1) AND (char_length(prompt) <= 2000))),
  CONSTRAINT "slack_agent_schedules_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text]))),
  CONSTRAINT "slack_agent_schedules_timezone_check" CHECK (((char_length(timezone) <= 64) AND (timezone ~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){0,2}$'::text))),
  CONSTRAINT "slack_agent_schedules_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 80) AND (title = btrim(title)) AND (title !~ '[[:cntrl:]]'::text)))
);

ALTER TABLE "public"."slack_agent_schedules"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_agent_schedules_due_idx ON public.slack_agent_schedules USING btree (next_run_at)
  WHERE (status = 'active'::text);

CREATE INDEX slack_agent_schedules_installation_idx ON public.slack_agent_schedules USING btree (installation_id, created_at);

CREATE TRIGGER slack_agent_schedules_set_updated_at
  BEFORE UPDATE ON public.slack_agent_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_schedules"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_schedules" IS 'Recurring tasks people set up with the Slack agent: a self-contained prompt it answers in one conversation, hourly at the most, at a local time in the creator''s Slack time zone. At most slack_installations.schedules_max per installation (save_slack_agent_schedule, the only way in). The Worker''s cron trigger claims due rows (claim_slack_agent_schedules); admins pause, resume and delete them in Settings > Slack; uninstalling deletes them (delete_slack_agent_schedules).';

COMMENT ON COLUMN "public"."slack_agent_schedules"."channel_id" IS 'The conversation (channel or DM) where each run posts its "Scheduled:" message and answers in its thread.';

COMMENT ON COLUMN "public"."slack_agent_schedules"."created_by" IS 'The Slack user (U... or W...) who set it up. Each run is an answer to them: their access is checked and the meter counts it for them.';

COMMENT ON COLUMN "public"."slack_agent_schedules"."timezone" IS 'The creator''s IANA time zone from Slack (users.info tz) when it was set up. hour, minute, day_of_week (1 Monday to 7 Sunday) and day_of_month are local times there.';

COMMENT ON COLUMN "public"."slack_agent_schedules"."creation_key" IS 'Keys what the schedule_task call that saved it set up (the Slack event it answered, the answer''s part, and a digest of its conversation, title and timing), so a retried Workflow step gets the schedule it saved instead of a second one.';

COMMENT ON COLUMN "public"."slack_agent_schedules"."last_run_at" IS 'The time the last claimed run was due. With last_result null, that run hasn''t reported back yet.';

COMMENT ON COLUMN "public"."slack_agent_schedules"."last_claimed_at" IS 'When the last run was claimed, which can be later than it was due. The next run is at least 50 minutes after it, also after a resume.';

COMMENT ON COLUMN "public"."slack_agent_schedules"."failures" IS 'Runs in a row that failed or were skipped. The third pauses the schedule (pause_reason failures) and the creator is told privately.';

REVOKE ALL ON TABLE "public"."slack_agent_schedules" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."slack_agent_schedules" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_schedules" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.slack_agent_schedule_next_run (
  p_frequency    text,
  p_hour         integer,
  p_minute       integer,
  p_day_of_week  integer,
  p_day_of_month integer,
  p_timezone     text,
  p_after        timestamp with time zone
)
  RETURNS timestamp with time zone
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
-- When a Slack agent schedule runs next: the first time after p_after that
-- matches it, in local time in p_timezone (an IANA name, as Slack gives it).
-- hourly runs at p_minute past every local hour; daily, weekdays (Monday to
-- Friday), weekly (p_day_of_week, 1 Monday to 7 Sunday) and monthly
-- (p_day_of_month, or the month's last day when it is shorter) at
-- p_hour:p_minute. A local time that a daylight saving change skips or repeats
-- resolves as Postgres resolves it; the result is always later than p_after.
-- Raises 22023 for an unknown time zone or a frequency it doesn't know.
declare
  v_local timestamp := p_after at time zone p_timezone;
  v_time interval := make_interval(hours => coalesce(p_hour, 0), mins => p_minute);
  v_candidate timestamp;
  v_month date;
  v_at timestamptz;
begin
  if p_frequency = 'hourly' then
    v_candidate := date_trunc('hour', v_local) + make_interval(mins => p_minute);
    for step in 0..3 loop
      v_at := (v_candidate + make_interval(hours => step)) at time zone p_timezone;
      if v_at > p_after then
        return v_at;
      end if;
    end loop;
  elsif p_frequency = 'monthly' then
    for step in 0..2 loop
      v_month := (date_trunc('month', v_local) + make_interval(months => step))::date;
      v_candidate := v_month
        + (least(p_day_of_month, extract(day from v_month + interval '1 month' - interval '1 day')::integer) - 1)
        + v_time;
      v_at := v_candidate at time zone p_timezone;
      if v_at > p_after then
        return v_at;
      end if;
    end loop;
  elsif p_frequency in ('daily', 'weekdays', 'weekly') then
    for step in 0..8 loop
      v_candidate := (v_local::date + step) + v_time;
      if p_frequency = 'daily'
        or (p_frequency = 'weekdays' and extract(isodow from v_candidate) between 1 and 5)
        or (p_frequency = 'weekly' and extract(isodow from v_candidate) = p_day_of_week) then
        v_at := v_candidate at time zone p_timezone;
        if v_at > p_after then
          return v_at;
        end if;
      end if;
    end loop;
  end if;
  raise exception 'invalid_schedule' using errcode = '22023';
end;
$function$;

COMMENT ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) IS 'The next time a Slack agent schedule runs after p_after, at its local time in p_timezone. Always later than p_after.';

GRANT EXECUTE ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."slack_agent_schedule_next_run"(text, integer, integer, integer, integer, text, timestamp with time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.save_slack_agent_schedule (
  p_installation_id uuid,
  p_channel_id      text,
  p_title           text,
  p_prompt          text,
  p_frequency       text,
  p_hour            integer,
  p_minute          integer,
  p_day_of_week     integer,
  p_day_of_month    integer,
  p_timezone        text,
  p_created_by      text,
  p_creation_key    text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The Slack agent's schedule_task tool: saves a recurring task for one
-- conversation, which first runs at the next matching local time. Only while the
-- installation's admins allow recurring tasks (schedules_enabled), only for
-- someone who linked their Phaseo account when they allow only that
-- (schedule_creators linked), and at most schedules_max (20 by default) per
-- installation. Hourly is the finest frequency, so nothing runs more often.
-- Locks the installation row like the memory functions, so the cap holds and
-- uninstalling, which deletes every schedule, can't miss one.
-- p_creation_key keys what the tool call sets up (its Slack event, the answer's
-- part, and a digest of the conversation, title and timing): saving again with
-- the same key, as a retried Workflow step does, returns the schedule saved the
-- first time and saves nothing.
-- Returns {status: saved | full | off | link_required | not_installed,
-- schedule?, limit?}. Service role only.
declare
  v_installation public.slack_installations%rowtype;
  v_schedule public.slack_agent_schedules%rowtype;
begin
  select * into v_installation
  from public.slack_installations installation
  where installation.id = p_installation_id and installation.status <> 'uninstalled'
  for no key update;
  if not found then
    return jsonb_build_object('status', 'not_installed');
  end if;
  select * into v_schedule
  from public.slack_agent_schedules schedule
  where schedule.installation_id = p_installation_id and schedule.creation_key = p_creation_key;
  if found then
    return jsonb_build_object('status', 'saved', 'schedule', to_jsonb(v_schedule) - 'installation_id');
  end if;
  if not v_installation.schedules_enabled then
    return jsonb_build_object('status', 'off');
  end if;
  if v_installation.schedule_creators = 'linked' and not exists (
    select 1 from public.slack_user_links link
    where link.installation_id = p_installation_id and link.slack_user_id = p_created_by
  ) then
    return jsonb_build_object('status', 'link_required');
  end if;
  if (select count(*) from public.slack_agent_schedules schedule where schedule.installation_id = p_installation_id) >= v_installation.schedules_max then
    return jsonb_build_object('status', 'full', 'limit', v_installation.schedules_max);
  end if;

  insert into public.slack_agent_schedules (
    installation_id, channel_id, title, prompt, frequency, hour, minute, day_of_week, day_of_month, timezone, created_by, creation_key, next_run_at
  )
  values (
    p_installation_id, p_channel_id, btrim(p_title), btrim(p_prompt), p_frequency, p_hour, p_minute, p_day_of_week, p_day_of_month, p_timezone, p_created_by, p_creation_key,
    public.slack_agent_schedule_next_run(p_frequency, p_hour, p_minute, p_day_of_week, p_day_of_month, p_timezone, now())
  )
  returning * into v_schedule;
  return jsonb_build_object('status', 'saved', 'schedule', to_jsonb(v_schedule) - 'installation_id');
end;
$function$;

COMMENT ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) IS 'For the Slack Worker''s schedule_task tool: saves a recurring task, at most schedules_max per installation, while recurring tasks are on and the creator may set them up; a repeat with the same p_creation_key returns the one already saved. Returns {status: saved | full | off | link_required | not_installed, schedule?, limit?}.';

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."save_slack_agent_schedule"(uuid, text, text, text, text, integer, integer, integer, integer, text, text, text) FROM PUBLIC, "anon", "authenticated";

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
        last_claimed_at = now(),
        next_run_at = public.slack_agent_schedule_next_run(
          schedule.frequency, schedule.hour, schedule.minute, schedule.day_of_week, schedule.day_of_month, schedule.timezone,
          now() + interval '50 minutes'
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

COMMENT ON FUNCTION "public"."claim_slack_agent_schedules"(integer) IS 'For the Slack Worker''s cron trigger: claims due schedules once (FOR UPDATE SKIP LOCKED), moves each to its next local time at least 50 minutes after the claim, pauses those of installations that aren''t active, skips them while recurring tasks are off, and returns the runs to start.';

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

CREATE OR REPLACE FUNCTION public.cancel_slack_agent_schedule (
  p_installation_id uuid,
  p_schedule_id     uuid,
  p_slack_user_id   text
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- The Slack agent's cancel_schedule tool: deletes one of the installation's
-- schedules for the person who set it up, or for someone whose Slack account is
-- linked to an owner or admin of the installation's Phaseo workspace. Returns
-- deleted, not_allowed or not_found. Service role only.
declare
  v_created_by text;
  v_workspace_id uuid;
begin
  select schedule.created_by, installation.workspace_id into v_created_by, v_workspace_id
  from public.slack_agent_schedules schedule
  join public.slack_installations installation on installation.id = schedule.installation_id
  where schedule.id = p_schedule_id and schedule.installation_id = p_installation_id
  for update of schedule;
  if not found then
    return 'not_found';
  end if;
  if v_created_by is distinct from p_slack_user_id and not exists (
    select 1
    from public.slack_user_links link
    where link.installation_id = p_installation_id and link.slack_user_id = p_slack_user_id
      and (
        exists (
          select 1 from public.workspace_members member
          where member.workspace_id = v_workspace_id and member.user_id = link.user_id and member.role in ('owner', 'admin')
        )
        or exists (
          select 1 from public.workspaces workspace
          where workspace.id = v_workspace_id and workspace.owner_user_id = link.user_id
        )
      )
  ) then
    return 'not_allowed';
  end if;
  delete from public.slack_agent_schedules schedule where schedule.id = p_schedule_id;
  return 'deleted';
end;
$function$;

COMMENT ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) IS 'For the Slack Worker''s cancel_schedule tool: deletes a schedule for its creator, or for a Slack person linked to an owner or admin of the workspace. Returns deleted, not_allowed or not_found.';

GRANT EXECUTE ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."cancel_slack_agent_schedule"(uuid, uuid, text) FROM PUBLIC, "anon", "authenticated";

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

CREATE OR REPLACE FUNCTION public.delete_slack_agent_schedules()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Uninstalling, from Phaseo settings (web-api) or in Slack
  -- (uninstall_slack_agent_from_slack), deletes the installation's recurring
  -- tasks in the transaction that marks it uninstalled, like its memory
  -- (delete_slack_agent_memory). save_slack_agent_schedule locks the installation
  -- row, so a schedule being saved waits for this and then finds no installation.
  delete from public.slack_agent_schedules schedule where schedule.installation_id = new.id;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."delete_slack_agent_schedules"() IS 'Deletes a Slack agent installation''s recurring tasks when it is marked uninstalled, whichever path uninstalls it.';

REVOKE ALL ON FUNCTION "public"."delete_slack_agent_schedules"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_slack_agent_schedules"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."delete_slack_agent_schedules"() FROM PUBLIC, "anon", "authenticated";

CREATE TRIGGER slack_installations_delete_agent_schedules
  AFTER UPDATE OF status ON public.slack_installations
  FOR EACH ROW
  WHEN (((new.status = 'uninstalled'::text) AND (old.status IS DISTINCT FROM 'uninstalled'::text)))
  EXECUTE FUNCTION public.delete_slack_agent_schedules();
