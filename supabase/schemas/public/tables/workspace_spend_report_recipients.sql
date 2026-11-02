CREATE TABLE "public"."workspace_spend_report_recipients" (
  "workspace_id"      uuid                     NOT NULL,
  "user_id"           uuid                     NOT NULL,
  "unsubscribe_token" uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "opted_out_at"      timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_spend_report_recipients_pkey" PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT "workspace_spend_report_recipients_unsubscribe_token_key" UNIQUE (unsubscribe_token),
  CONSTRAINT "workspace_spend_report_recipients_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_spend_report_recipients_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_spend_report_recipients"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_spend_report_recipients_user_id_idx ON public.workspace_spend_report_recipients USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_spend_report_recipients"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_spend_report_recipients"."opted_out_at" IS 'When this person unsubscribed from this workspace''s spend report emails (the link in every report). Null while subscribed. Owners and admins who opted out get no report email until they subscribe again from the same link.';

COMMENT ON COLUMN "public"."workspace_spend_report_recipients"."unsubscribe_token" IS 'The unguessable token in this person''s unsubscribe link and List-Unsubscribe header for this workspace''s reports. Stable, so every report carries the same link.';

COMMENT ON TABLE "public"."workspace_spend_report_recipients" IS 'One row per person who has been sent (or is due) a spend report email for a workspace: the per-recipient unsubscribe token and opt-out. Rows are created by public.queue_spend_reports when it first emails someone. Service role only; the public unsubscribe page reaches it through public.set_spend_report_subscription.';

REVOKE ALL ON TABLE "public"."workspace_spend_report_recipients" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."workspace_spend_report_recipients" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_spend_report_recipients" FROM "anon", "authenticated";
