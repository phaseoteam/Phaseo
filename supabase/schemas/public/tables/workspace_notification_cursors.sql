CREATE TABLE "public"."workspace_notification_cursors" (
  "source"            text                     NOT NULL,
  "read_until"        timestamp with time zone NOT NULL,
  "resume_created_at" timestamp with time zone,
  "resume_id"         uuid,
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_notification_cursors_pkey" PRIMARY KEY (source),
  CONSTRAINT "workspace_notification_cursors_resume_check" CHECK (((resume_created_at IS NULL) = (resume_id IS NULL))),
  CONSTRAINT "workspace_notification_cursors_source_check" CHECK ((source = ANY (ARRAY['email_outbox'::text, 'workspace_audit_events'::text])))
);

ALTER TABLE "public"."workspace_notification_cursors"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_notification_cursors"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_notification_cursors"."read_until" IS 'Rows created up to this moment have been read. The next read starts ten minutes earlier, so a row whose transaction committed late is still seen.';

COMMENT ON COLUMN "public"."workspace_notification_cursors"."resume_created_at" IS 'With resume_id, the last row (created_at, id) of a read cut short by its row limit. The next read carries on after it instead of starting the overlap again, so a full page always moves the cursor.';

COMMENT ON TABLE "public"."workspace_notification_cursors" IS 'Read positions of capture_workspace_notification_events in email_outbox and workspace_audit_events.';

REVOKE ALL ON TABLE "public"."workspace_notification_cursors" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_notification_cursors" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_notification_cursors" FROM "anon", "authenticated";
