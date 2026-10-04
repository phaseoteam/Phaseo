CREATE TABLE "public"."workspace_sso_monthly_active_users" (
  "workspace_id"  uuid                     NOT NULL,
  "period_start"  date                     NOT NULL,
  "auth_user_id"  uuid                     NOT NULL,
  "first_seen_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_seen_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_sso_monthly_active_users_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "workspace_sso_monthly_active_users_pkey" PRIMARY KEY (workspace_id, period_start, auth_user_id),
  CONSTRAINT "workspace_sso_monthly_active_users_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_sso_monthly_active_users"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_sso_monthly_active_users_auth_user_id_idx ON public.workspace_sso_monthly_active_users USING btree (auth_user_id);

CREATE INDEX workspace_sso_monthly_active_users_period_idx ON public.workspace_sso_monthly_active_users USING btree (period_start, workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_sso_monthly_active_users"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."workspace_sso_monthly_active_users" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_sso_monthly_active_users" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_sso_monthly_active_users" FROM "anon", "authenticated";
