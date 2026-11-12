CREATE TABLE "public"."workspace_low_balance_email_state" (
  "workspace_id"    uuid                     NOT NULL,
  "armed"           boolean                  NOT NULL,
  "balance_nanos"   bigint                   NOT NULL,
  "threshold_nanos" bigint                   NOT NULL,
  "changed_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "last_alert_at"   timestamp with time zone,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_low_balance_email_state_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_low_balance_email_state_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_low_balance_email_state"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_low_balance_email_state"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."armed" IS 'True while the balance is above the low-balance email threshold. A sweep that finds it at or below the threshold emails (unless auto top-up is working or the six-hour cooldown holds) and clears it; a sweep that finds it back above sets it again.';

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."balance_nanos" IS 'Wallet balance when armed last changed, or when the workspace was first seen.';

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."changed_at" IS 'When armed last changed, or when the workspace was first seen. A sweep writes a row only when armed changes, so an idle sweep writes nothing.';

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."last_alert_at" IS 'When the last low-balance email was queued. A drop while auto top-up is working is recorded without an email and leaves this unchanged.';

COMMENT ON COLUMN "public"."workspace_low_balance_email_state"."threshold_nanos" IS 'The workspace''s low_balance_email_threshold_nanos the balance was compared with then.';

COMMENT ON TABLE "public"."workspace_low_balance_email_state" IS 'Low-balance email state of each workspace with low-balance emails on, kept by sweep_low_balance_emails with the same armed/unarmed rules as workspace_low_balance_push_state: a drop to or below the threshold is emailed once, and the email is armed again only once the balance is back above it. A separate table because the push watches a different set of workspaces (owners and admins with push on) at a different threshold ($5 without one), so the two can be armed differently. Rows are kept while emails are off, so turning them back on does not resend a drop already emailed.';

REVOKE ALL ON TABLE "public"."workspace_low_balance_email_state" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_low_balance_email_state" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_low_balance_email_state" FROM "anon", "authenticated";
