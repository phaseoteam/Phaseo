CREATE TABLE "public"."workspace_enterprise_member_overages" (
  "workspace_id"  uuid                     NOT NULL,
  "period_start"  date                     NOT NULL,
  "user_id"       uuid                     NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_enterprise_member_overages_pkey" PRIMARY KEY (workspace_id, period_start, user_id),
  CONSTRAINT "workspace_enterprise_member_overages_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_enterprise_member_overages_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_enterprise_member_overages"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_enterprise_member_overages_period_idx ON public.workspace_enterprise_member_overages USING btree (period_start, workspace_id);

CREATE INDEX workspace_enterprise_member_overages_user_id_idx ON public.workspace_enterprise_member_overages USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_enterprise_member_overages"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_enterprise_member_overages" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_enterprise_member_overages" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_enterprise_member_overages" FROM "anon", "authenticated";
