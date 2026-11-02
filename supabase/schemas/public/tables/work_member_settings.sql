CREATE TABLE "public"."work_member_settings" (
  "workspace_id"        uuid                     NOT NULL,
  "user_id"             uuid                     NOT NULL,
  "email_notifications" text                     NOT NULL DEFAULT 'digest'::text,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_member_settings_email_notifications_check" CHECK ((email_notifications = ANY (ARRAY['off'::text, 'digest'::text]))),
  CONSTRAINT "work_member_settings_pkey" PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT "work_member_settings_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_member_settings_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_member_settings"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_member_settings"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_member_settings" IS 'A member''s own work tracker settings in a workspace. A missing row means the defaults (email_notifications = digest).';

REVOKE ALL ON TABLE "public"."work_member_settings" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_member_settings" TO "service_role";

REVOKE ALL ON TABLE "public"."work_member_settings" FROM "anon", "authenticated";
