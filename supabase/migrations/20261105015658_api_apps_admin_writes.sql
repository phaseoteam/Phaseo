-- Only workspace owners and admins may create, change or delete apps through PostgREST.
-- Before this, any member (is_workspace_member) could set is_public, which publishes the app's
-- usage and cost through v2_public_usage_daily/_hourly, rename it, or delete it.
-- Signed-in members still read their workspace's apps. The gateway registers apps with the
-- service role and the chat-app trigger is SECURITY DEFINER, so neither depends on these policies.

ALTER POLICY "api_apps_delete_own_team" ON "public"."api_apps"
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id));

ALTER POLICY "api_apps_insert_own_team" ON "public"."api_apps"
  TO "authenticated"
  WITH CHECK (public.is_workspace_admin(workspace_id));

ALTER POLICY "api_apps_update_own_team" ON "public"."api_apps"
  TO "authenticated"
  USING (public.is_workspace_admin(workspace_id))
  WITH CHECK (public.is_workspace_admin(workspace_id));
