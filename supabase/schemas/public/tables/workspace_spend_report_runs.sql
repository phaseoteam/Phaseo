CREATE TABLE "public"."workspace_spend_report_runs" (
  "workspace_id" uuid                     NOT NULL,
  "cadence"      text                     NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end"   timestamp with time zone NOT NULL,
  "status"       text                     NOT NULL,
  "spend_nanos"  numeric,
  "recipients"   integer                  NOT NULL DEFAULT 0,
  "event_id"     uuid,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_report_runs_cadence_check" CHECK ((cadence = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "workspace_spend_report_runs_period_check" CHECK ((period_end > period_start)),
  CONSTRAINT "workspace_spend_report_runs_pkey" PRIMARY KEY (workspace_id, cadence),
  CONSTRAINT "workspace_spend_report_runs_recipients_check" CHECK ((recipients >= 0)),
  CONSTRAINT "workspace_spend_report_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'skipped'::text]))),
  CONSTRAINT "workspace_spend_report_runs_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_report_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_spend_report_runs"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_spend_report_runs"."event_id" IS 'The email_outbox id of the routed spend_report event, when this run queued one.';

COMMENT ON COLUMN "public"."workspace_spend_report_runs"."period_start" IS 'Start of the last report period handled for this cadence (local midnight in the workspace billing_time_zone, as an instant).';

COMMENT ON COLUMN "public"."workspace_spend_report_runs"."recipients" IS 'How many report emails the run queued (owners, plus admins when spend_report_include_admins is on, less anyone who unsubscribed).';

COMMENT ON COLUMN "public"."workspace_spend_report_runs"."status" IS 'queued: the report was queued (routed event plus emails). skipped: the workspace spent nothing in the period.';

COMMENT ON TABLE "public"."workspace_spend_report_runs" IS 'The last spend report period public.queue_spend_reports handled per workspace and cadence, so each period is computed once (including periods skipped for zero spend). One row per workspace and cadence, updated in place. The email_outbox dedupe keys guarantee no duplicate report even if this row is lost. Service role only.';

REVOKE ALL ON TABLE "public"."workspace_spend_report_runs" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_report_runs" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_report_runs" FROM "anon", "authenticated";
