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
