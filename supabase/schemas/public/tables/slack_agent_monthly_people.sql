CREATE TABLE "public"."slack_agent_monthly_people" (
  "installation_id" uuid                     NOT NULL,
  "period_start"    date                     NOT NULL,
  "slack_user_id"   text                     NOT NULL,
  "first_answer_at" timestamp with time zone NOT NULL,
  "answers"         bigint                   NOT NULL DEFAULT 0,
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_agent_monthly_people_answers_check" CHECK ((answers >= 0)),
  CONSTRAINT "slack_agent_monthly_people_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_monthly_people_period_check" CHECK ((period_start = (date_trunc('month'::text, (period_start)::timestamp without time zone))::date)),
  CONSTRAINT "slack_agent_monthly_people_pkey" PRIMARY KEY (installation_id, period_start, slack_user_id),
  CONSTRAINT "slack_agent_monthly_people_slack_user_id_check" CHECK ((slack_user_id ~ '^[UW][A-Z0-9]{2,31}$'::text))
);

ALTER TABLE "public"."slack_agent_monthly_people"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_agent_monthly_people_period_idx ON public.slack_agent_monthly_people USING btree (period_start, installation_id);

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_monthly_people"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_monthly_people" IS 'Each Slack person the agent answered in a UTC calendar month, with their answer count. The Slack Worker''s per-installation meter writes it through record_slack_agent_people; the month-end charge counts people and pooled answers from it.';

REVOKE ALL ON TABLE "public"."slack_agent_monthly_people" FROM "service_role";

GRANT SELECT ON TABLE "public"."slack_agent_monthly_people" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_monthly_people" FROM "anon", "authenticated";
