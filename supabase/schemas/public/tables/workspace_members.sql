CREATE TABLE "public"."workspace_members" (
  "workspace_id"     uuid                     NOT NULL,
  "user_id"          uuid                     NOT NULL,
  "joined_at"        timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "last_accessed_at" timestamp with time zone,
  CONSTRAINT "workspace_members_pkey" PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
  CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_members"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."workspace_members"
  ADD COLUMN "role" public.workspace_role NOT NULL;

CREATE INDEX workspace_members_user_idx ON public.workspace_members USING btree (user_id);

CREATE INDEX workspace_members_user_recent_access_idx ON public.workspace_members USING btree (user_id, last_accessed_at DESC NULLS LAST, workspace_id);

CREATE INDEX workspace_members_workspace_idx ON public.workspace_members USING btree (workspace_id);

CREATE TRIGGER revoke_oauth_on_workspace_member_delete
  AFTER DELETE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.revoke_oauth_on_workspace_member_delete();

CREATE TRIGGER workspace_enterprise_member_limit_guard
  BEFORE INSERT ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_workspace_enterprise_member_capacity();

CREATE TRIGGER workspace_enterprise_member_overage_guard
  AFTER INSERT ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION private.record_workspace_enterprise_member_overage();

CREATE TRIGGER workspace_members_capture_manual_grant
  AFTER INSERT OR DELETE OR UPDATE OF ROLE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_manual_workspace_grant();

CREATE TRIGGER workspace_members_role_policy_guard
  BEFORE INSERT OR UPDATE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workspace_member_role_policy();

CREATE TRIGGER zz_workspace_members_refresh_effective
  AFTER INSERT OR DELETE OR UPDATE OF ROLE ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_effective_entitlements_after_directory_change();

CREATE POLICY "workspace_members_no_oauth_client_insert" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_members_no_oauth_client_update" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "workspace_members_no_oauth_client_delete" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."workspace_members"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "team_members_select_own_team" ON "public"."workspace_members"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_members" TO "service_role";

GRANT SELECT ON TABLE "public"."workspace_members" TO "anon";

GRANT DELETE, SELECT ON TABLE "public"."workspace_members" TO "authenticated";

GRANT UPDATE ("role") ON TABLE "public"."workspace_members" TO "authenticated";

CREATE POLICY "workspace_members_delete_authorized" ON "public"."workspace_members"
  FOR DELETE
  TO "authenticated"
  USING (((NOT (EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = workspace_members.user_id))))) AND
    ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))) OR (user_id = ( SELECT auth.uid() AS uid)))));

CREATE POLICY "workspace_members_update_owner" ON "public"."workspace_members"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))));

COMMENT ON COLUMN "public"."workspace_members"."last_accessed_at" IS 'Most recent time this member selected the workspace in the Phaseo web app.';
