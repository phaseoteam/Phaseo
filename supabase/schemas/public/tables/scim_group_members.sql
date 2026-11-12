CREATE TABLE "public"."scim_group_members" (
  "workspace_id" uuid                     NOT NULL,
  "group_id"     uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "scim_group_members_pkey" PRIMARY KEY (group_id, user_id),
  CONSTRAINT "scim_group_members_group_workspace_fkey" FOREIGN KEY (group_id, workspace_id) REFERENCES public.scim_groups(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "scim_group_members_user_workspace_fkey" FOREIGN KEY (user_id, workspace_id) REFERENCES public.scim_users(id, workspace_id) ON DELETE CASCADE,
  CONSTRAINT "scim_group_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."scim_group_members"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX scim_group_members_group_workspace_idx ON public.scim_group_members USING btree (group_id, workspace_id);

CREATE INDEX scim_group_members_user_id_idx ON public.scim_group_members USING btree (user_id);

CREATE INDEX scim_group_members_user_workspace_idx ON public.scim_group_members USING btree (user_id, workspace_id);

CREATE INDEX scim_group_members_workspace_id_idx ON public.scim_group_members USING btree (workspace_id);

CREATE TRIGGER scim_group_members_reconcile
  AFTER INSERT OR DELETE ON public.scim_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.reconcile_scim_entitlements_trigger();

CREATE TRIGGER zz_scim_group_members_refresh_effective
  AFTER INSERT OR DELETE ON public.scim_group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_effective_entitlements_after_directory_change();

CREATE POLICY "deny_direct_client_access" ON "public"."scim_group_members"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."scim_group_members" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."scim_group_members" TO "service_role";

REVOKE ALL ON TABLE "public"."scim_group_members" FROM "anon", "authenticated";
