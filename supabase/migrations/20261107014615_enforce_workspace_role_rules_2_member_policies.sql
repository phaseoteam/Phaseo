SET LOCAL lock_timeout = '10s';

-- Workspace role rules, part 2 of 3: workspace_members policies and grants. Policy changes take an ACCESS
-- EXCLUSIVE lock on workspace_members, the only hot table this file locks; the policy expressions read
-- workspaces with an ACCESS SHARE lock, which conflicts with no reader or writer. If live requests hold
-- workspace_members for longer than the lock timeout, this file fails without changes and can be rerun.
-- phaseo:allow-destructive-migration reason: DELETE appears only as a privilege name in REVOKE and DROP POLICY IF EXISTS replaces policy definitions; no rows, columns or tables are removed.
--
-- Admins could insert any user into their workspace (with a forged joined_at), promote members to admin
-- and remove other admins (which revokes their keys). People join only through an invite and an approved
-- join request (approve_workspace_join_request / the management API, both SECURITY DEFINER or service
-- role) or SCIM/SSO provisioning on the server, so signed-in users lose INSERT. Only the owner changes
-- roles (only the role column is updatable), and members are removed by the owner, or leave themselves;
-- nobody removes the owner. service_role is unaffected.
DROP POLICY IF EXISTS "team_members_insert_admin" ON "public"."workspace_members";
DROP POLICY IF EXISTS "team_members_update_admin" ON "public"."workspace_members";

REVOKE INSERT, UPDATE, DELETE ON TABLE "public"."workspace_members" FROM "anon";
REVOKE INSERT, UPDATE ON TABLE "public"."workspace_members" FROM "authenticated";
GRANT UPDATE ("role") ON TABLE "public"."workspace_members" TO "authenticated";

DROP POLICY IF EXISTS "workspace_members_update_owner" ON "public"."workspace_members";
CREATE POLICY "workspace_members_update_owner" ON "public"."workspace_members"
  FOR UPDATE
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))))
  WITH CHECK ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))));

ALTER POLICY "workspace_members_delete_authorized" ON "public"."workspace_members"
  USING (((NOT (EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = workspace_members.user_id))))) AND
    ((EXISTS ( SELECT 1
   FROM public.workspaces workspace
  WHERE ((workspace.id = workspace_members.workspace_id) AND (workspace.owner_user_id = ( SELECT auth.uid() AS uid))))) OR (user_id = ( SELECT auth.uid() AS uid)))));
